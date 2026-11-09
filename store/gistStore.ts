import { create } from "zustand";
import { describeError } from "@/lib/supabase";
import { getSmartFeed } from "@/lib/feed";
import * as confessionsService from "@/services/confessionsService";
import { fetchRankedFeed } from "@/services/feedAlgo";
import * as postsService from "@/services/postsService";
import * as schoolsService from "@/services/schoolsService";
import type {
  Comment,
  CommentThreadTarget,
  Confession,
  ConfessionCategory,
  Post,
  ReactionKind,
  School,
} from "@/types/models";

/**
 * Client cache over the Supabase services. Nothing here is seeded — every
 * array starts empty and is filled by the network.
 */

export type ComposerType = "gist" | "confession";

const PAGE_SIZE = 10;
let feedLoadRequestId = 0;
let followingLoadRequestId = 0;
let feedRotationSeed = Math.random();

const commentThreadKey = (target: CommentThreadTarget) => `${target.type}:${target.id}`;

function removeCommentBranch(comments: Comment[], commentId: string): Comment[] {
  const removedIds = new Set([commentId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const comment of comments) {
      if (comment.parentId && removedIds.has(comment.parentId) && !removedIds.has(comment.id)) {
        removedIds.add(comment.id);
        changed = true;
      }
    }
  }
  return comments.filter((comment) => !removedIds.has(comment.id));
}

interface GistState {
  /* schools */
  schools: School[];
  schoolsHasLoaded: boolean;
  schoolsLoading: boolean;
  schoolsError: string | null;
  loadSchools: () => Promise<void>;
  upsertSchool: (school: School) => void;
  createSchool: (input: schoolsService.CreateSchoolInput) => Promise<School>;
  claimSchool: (schoolId: string, userId: string) => Promise<void>;

  /* feed */
  posts: Post[];
  seenPostIds: string[];
  followingPosts: Post[];
  feedHasLoaded: boolean;
  followingHasLoaded: boolean;
  feedLoading: boolean;
  followingLoading: boolean;
  feedLoadingMore: boolean;
  followingLoadingMore: boolean;
  feedError: string | null;
  feedHasMore: boolean;
  followingHasMore: boolean;
  feedSchoolId: string | null;
  trendingPosts: Post[];
  trendingFallback: Post[];
  trendingHasLoaded: boolean;
  trendingLoading: boolean;
  trendingThreshold: number;
  setFeedSchool: (schoolId: string | null) => void;
  loadFeed: (options?: { silent?: boolean }) => Promise<void>;
  hydrateInitialPublicContent: (
    posts?: Post[] | null,
    confessions?: Confession[] | null,
    trendingPosts?: Post[] | null,
    trendingFallback?: Post[] | null
  ) => void;
  loadFollowingFeed: (options?: { silent?: boolean }) => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  loadMoreFollowingFeed: () => Promise<void>;
  loadTrending: () => Promise<void>;
  createPost: (input: postsService.CreatePostInput) => Promise<Post>;
  toggleLike: (postId: string, fallbackPost?: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  patchPost: (postId: string, patch: Partial<Post>) => void;
  removePostLocally: (postId: string) => void;

  /* comments */
  commentsByThread: Record<string, Comment[]>;
  commentsLoading: Record<string, boolean>;
  commentsError: Record<string, string | null>;
  activeCommentThread: CommentThreadTarget | null;
  openComments: (target: CommentThreadTarget) => void;
  closeComments: () => void;
  loadComments: (target: CommentThreadTarget) => Promise<void>;
  addComment: (target: CommentThreadTarget, content: string, parentId?: string | null) => Promise<void>;
  deleteComment: (target: CommentThreadTarget, commentId: string) => Promise<void>;
  toggleCommentLike: (target: CommentThreadTarget, commentId: string) => Promise<void>;

  /* confessions */
  confessions: Confession[];
  confessionsHasLoaded: boolean;
  confessionsLoading: boolean;
  confessionsError: string | null;
  myConfessions: Confession[];
  myConfessionsError: string | null;
  loadConfessions: () => Promise<void>;
  loadMyConfessions: () => Promise<void>;
  upsertPublicConfession: (confession: Confession) => void;
  submitConfession: (input: { content: string; category: ConfessionCategory; schoolId: string | null }) => Promise<Confession>;
  publishConfessionLocally: (confession: Confession) => void;
  toggleReaction: (confessionId: string, kind: ReactionKind) => Promise<void>;

  /* composer intent */
  composerType: ComposerType;
  composerSchoolId: string | null;
  setComposerIntent: (type: ComposerType, schoolId?: string | null) => void;
}

export const useGistStore = create<GistState>()((set, get) => ({
  /* ───────────── schools ───────────── */
  schools: [],
  schoolsHasLoaded: false,
  schoolsLoading: false,
  schoolsError: null,

  loadSchools: async () => {
    set({ schoolsLoading: true, schoolsError: null });
    try {
      const schools = await schoolsService.fetchSchools();
      set({ schools, schoolsHasLoaded: true, schoolsLoading: false });
    } catch (error) {
      set({ schoolsLoading: false, schoolsError: describeError(error, "Could not load schools.") });
    }
  },

  upsertSchool: (school) =>
    set((state) => ({
      schools: state.schools.some((item) => item.id === school.id)
        ? state.schools.map((item) => (item.id === school.id ? school : item))
        : [...state.schools, school].sort((a, b) => a.name.localeCompare(b.name)),
    })),

  createSchool: async (input) => {
    const school = await schoolsService.createSchoolCommunity(input);
    get().upsertSchool(school);
    return school;
  },

  claimSchool: async (schoolId, userId) => {
    await schoolsService.claimSchool(schoolId);
    set((state) => ({
      schools: state.schools.map((school) =>
        school.id === schoolId ? { ...school, creatorId: userId } : school
      ),
    }));
  },

  /* ───────────── feed ───────────── */
  posts: [],
  seenPostIds: [],
  followingPosts: [],
  feedHasLoaded: false,
  followingHasLoaded: false,
  feedLoading: false,
  followingLoading: false,
  feedLoadingMore: false,
  followingLoadingMore: false,
  feedError: null,
  feedHasMore: true,
  followingHasMore: true,
  feedSchoolId: null,
  trendingPosts: [],
  trendingFallback: [],
  trendingHasLoaded: false,
  trendingLoading: false,
  trendingThreshold: postsService.TRENDING_LIKE_THRESHOLD,

  setFeedSchool: (schoolId) => {
    if (get().feedSchoolId === schoolId) return;
    set({
      feedSchoolId: schoolId,
      posts: [],
      seenPostIds: [],
      followingPosts: [],
      feedHasLoaded: false,
      followingHasLoaded: false,
      feedHasMore: true,
      followingHasMore: true,
      feedLoadingMore: false,
      followingLoadingMore: false,
    });
    void get().loadFeed();
    void get().loadFollowingFeed();
  },

  hydrateInitialPublicContent: (initialPosts, initialConfessions, initialTrendingPosts, initialTrendingFallback) =>
    set((state) => ({
      ...(initialPosts !== undefined && initialPosts !== null && !state.feedHasLoaded
        ? {
            posts: initialPosts,
            seenPostIds: initialPosts.map((post) => post.id),
            feedHasLoaded: true,
            feedLoading: false,
            feedHasMore: initialPosts.length >= PAGE_SIZE,
          }
        : {}),
      ...(initialConfessions !== undefined && initialConfessions !== null && !state.confessionsHasLoaded
        ? {
            confessions: initialConfessions,
            confessionsHasLoaded: true,
            confessionsLoading: false,
            confessionsError: null,
          }
        : {}),
      ...(initialTrendingPosts !== undefined && initialTrendingPosts !== null && !state.trendingHasLoaded
        ? {
            trendingPosts: initialTrendingPosts,
            trendingFallback: initialTrendingFallback ?? [],
            trendingHasLoaded: true,
            trendingLoading: false,
          }
        : {}),
    })),

  loadFeed: async ({ silent } = {}) => {
    const schoolId = get().feedSchoolId;
    const seenPostIds = get().seenPostIds;
    const requestId = ++feedLoadRequestId;
    if (!silent) set({ feedLoading: true, feedError: null });
    try {
      const result = await getSmartFeed({
        userId: null,
        userSchoolId: schoolId,
        page: 1,
        limit: PAGE_SIZE,
        seenPostIds,
      });
      // Ignore stale responses if the school filter changed mid-flight.
      if (get().feedSchoolId !== schoolId || requestId !== feedLoadRequestId) return;
      set((state) => {
        const alreadySeen = new Set(state.seenPostIds);
        const freshPosts = result.posts.filter((post) => !alreadySeen.has(post.id));
        const freshPostIds = new Set(freshPosts.map((post) => post.id));
        const retainedPosts = state.posts.filter((post) => !freshPostIds.has(post.id));
        const nextPosts = [...freshPosts, ...retainedPosts];
        const nextSeenPostIds = [...new Set([...state.seenPostIds, ...nextPosts.map((post) => post.id)])];
        return {
          posts: nextPosts,
          seenPostIds: nextSeenPostIds,
          feedHasLoaded: true,
          feedLoading: false,
          feedHasMore: result.hasMore,
          feedError: null,
        };
      });
    } catch (error) {
      if (requestId !== feedLoadRequestId) return;
      set({ feedLoading: false, feedError: describeError(error, "Could not load the feed.") });
    }
  },

  loadFollowingFeed: async ({ silent } = {}) => {
    const requestId = ++followingLoadRequestId;
    const schoolId = get().feedSchoolId;
    if (!silent) set({ followingLoading: true, feedError: null });
    try {
      const posts = await fetchRankedFeed({ limit: PAGE_SIZE, followingOnly: true, schoolId, rotationSeed: feedRotationSeed });
      if (requestId !== followingLoadRequestId || get().feedSchoolId !== schoolId) return;
      set({
        followingPosts: posts,
        followingHasLoaded: true,
        followingLoading: false,
        followingHasMore: posts.length === PAGE_SIZE,
        feedError: null,
      });
    } catch (error) {
      if (requestId !== followingLoadRequestId) return;
      set({ followingLoading: false, feedError: describeError(error, "Could not load followed students' gists.") });
    }
  },

  loadMoreFeed: async () => {
    const { feedLoadingMore, feedHasMore, seenPostIds, feedSchoolId } = get();
    if (feedLoadingMore || !feedHasMore) return;
    set({ feedLoadingMore: true });
    try {
      const result = await getSmartFeed({
        userId: null,
        userSchoolId: feedSchoolId,
        page: Math.floor(seenPostIds.length / PAGE_SIZE) + 1,
        limit: PAGE_SIZE,
        seenPostIds,
      });
      if (get().feedSchoolId !== feedSchoolId) return;
      set((state) => {
        const seen = new Set(state.posts.map((post) => post.id));
        const uniqueMore = result.posts.filter((post) => !seen.has(post.id));
        const nextPosts = [...state.posts, ...uniqueMore];
        return {
          posts: nextPosts,
          seenPostIds: [...new Set([...state.seenPostIds, ...uniqueMore.map((post) => post.id)])],
          feedHasMore: result.hasMore && uniqueMore.length > 0,
          feedLoadingMore: false,
        };
      });
    } catch (error) {
      set({ feedLoadingMore: false, feedError: describeError(error, "Could not load more gists.") });
    }
  },

  loadMoreFollowingFeed: async () => {
    const { followingLoadingMore, followingHasMore, followingPosts, feedSchoolId } = get();
    if (followingLoadingMore || !followingHasMore) return;
    set({ followingLoadingMore: true });
    try {
      const more = await fetchRankedFeed({
        limit: PAGE_SIZE,
        offset: followingPosts.length,
        followingOnly: true,
        schoolId: feedSchoolId,
        rotationSeed: feedRotationSeed,
      });
      if (get().feedSchoolId !== feedSchoolId) return;
      set((state) => {
        const mergedPosts = new Map(state.followingPosts.map((post) => [post.id, post]));
        for (const post of more) mergedPosts.set(post.id, post);
        return {
          followingPosts: [...mergedPosts.values()],
          followingHasMore: more.length === PAGE_SIZE,
          followingLoadingMore: false,
        };
      });
    } catch (error) {
      set({ followingLoadingMore: false, feedError: describeError(error, "Could not load more followed gists.") });
    }
  },

  loadTrending: async () => {
    set({ trendingLoading: true });
    try {
      const [trendingPosts, fallback] = await Promise.all([
        postsService.fetchTrendingPosts(),
        postsService.fetchTopByLikes(4),
      ]);
      set({ trendingPosts, trendingFallback: fallback, trendingHasLoaded: true, trendingLoading: false });
    } catch (error) {
      set({ trendingLoading: false, feedError: describeError(error, "Could not load trending gists.") });
    }
  },

  createPost: async (input) => {
    const post = await postsService.createPost(input);
    const { feedSchoolId } = get();
    if (!feedSchoolId || feedSchoolId === post.schoolId) {
      set((state) => {
        const posts = [post, ...state.posts.filter((item) => item.id !== post.id)];
        return {
          posts,
          seenPostIds: [...new Set([post.id, ...state.seenPostIds])],
        };
      });
    }
    if (post.schoolId) {
      set((state) => ({
        schools: state.schools.map((school) =>
          school.id === post.schoolId ? { ...school, postCount: school.postCount + 1 } : school
        ),
      }));
    }
    return post;
  },

  toggleLike: async (postId, fallbackPost) => {
    const findPost = (): Post | undefined =>
      get().posts.find((post) => post.id === postId) ??
      get().trendingPosts.find((post) => post.id === postId) ??
      get().trendingFallback.find((post) => post.id === postId);
    const before = findPost() ?? fallbackPost;
    if (!before) return;

    get().patchPost(postId, {
      likedByMe: !before.likedByMe,
      likeCount: before.likeCount + (before.likedByMe ? -1 : 1),
    });

    try {
      const liked = await postsService.toggleLike(postId);
      const current = findPost();
      if (current && current.likedByMe !== liked) {
        get().patchPost(postId, {
          likedByMe: liked,
          likeCount: current.likeCount + (liked ? 1 : -1),
        });
      }
    } catch (error) {
      get().patchPost(postId, { likedByMe: before.likedByMe, likeCount: before.likeCount });
      throw error;
    }
  },

  deletePost: async (postId) => {
    await postsService.deletePost(postId);
    get().removePostLocally(postId);
  },

  patchPost: (postId, patch) =>
    set((state) => {
      const apply = (list: Post[]) =>
        list.map((post) => (post.id === postId ? { ...post, ...patch } : post));
      return {
        posts: apply(state.posts),
        trendingPosts: apply(state.trendingPosts),
        trendingFallback: apply(state.trendingFallback),
      };
    }),

  removePostLocally: (postId) =>
    set((state) => ({
      posts: state.posts.filter((post) => post.id !== postId),
      seenPostIds: state.seenPostIds.filter((id) => id !== postId),
      trendingPosts: state.trendingPosts.filter((post) => post.id !== postId),
      trendingFallback: state.trendingFallback.filter((post) => post.id !== postId),
    })),

  /* ───────────── comments ───────────── */
  commentsByThread: {},
  commentsLoading: {},
  commentsError: {},
  activeCommentThread: null,

  openComments: (target) => {
    set({ activeCommentThread: target });
    void get().loadComments(target).catch(() => undefined);
  },

  closeComments: () => set({ activeCommentThread: null }),

  loadComments: async (target) => {
    const key = commentThreadKey(target);
    set((state) => ({
      commentsLoading: { ...state.commentsLoading, [key]: true },
      commentsError: { ...state.commentsError, [key]: null },
    }));
    try {
      const comments = await postsService.fetchComments(target);
      set((state) => ({
        commentsByThread: { ...state.commentsByThread, [key]: comments },
        commentsLoading: { ...state.commentsLoading, [key]: false },
      }));
      if (target.type === "post") get().patchPost(target.id, { commentCount: comments.length });
      else set((state) => ({
        confessions: state.confessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
        myConfessions: state.myConfessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
      }));
    } catch (error) {
      set((state) => ({
        commentsLoading: { ...state.commentsLoading, [key]: false },
        commentsError: { ...state.commentsError, [key]: describeError(error, "Could not load comments.") },
      }));
      throw error;
    }
  },

  addComment: async (target, content, parentId = null) => {
    const comment = await postsService.addComment(target, content, parentId);
    const key = commentThreadKey(target);
    set((state) => ({
      commentsByThread: {
        ...state.commentsByThread,
        [key]: [...(state.commentsByThread[key] ?? []), comment],
      },
    }));
    const comments = get().commentsByThread[key];
    if (target.type === "post") get().patchPost(target.id, { commentCount: comments.length });
    else set((state) => ({
      confessions: state.confessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
      myConfessions: state.myConfessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
    }));
  },

  deleteComment: async (target, commentId) => {
    await postsService.deleteComment(target, commentId);
    const key = commentThreadKey(target);
    const comments = removeCommentBranch(get().commentsByThread[key] ?? [], commentId);
    set((state) => ({
      commentsByThread: {
        ...state.commentsByThread,
        [key]: comments,
      },
    }));
    if (target.type === "post") get().patchPost(target.id, { commentCount: comments.length });
    else set((state) => ({
      confessions: state.confessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
      myConfessions: state.myConfessions.map((item) => item.id === target.id ? { ...item, commentCount: comments.length } : item),
    }));
  },

  toggleCommentLike: async (target, commentId) => {
    const key = commentThreadKey(target);
    const comments = get().commentsByThread[key] ?? [];
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return;
    const likedByMe = !comment.likedByMe;
    const apply = (current: Comment[]) => current.map((item) => item.id === commentId
      ? { ...item, likedByMe, likesCount: Math.max(0, item.likesCount + (likedByMe ? 1 : -1)) }
      : item);
    set((state) => ({ commentsByThread: { ...state.commentsByThread, [key]: apply(state.commentsByThread[key] ?? []) } }));
    try {
      await postsService.toggleCommentLike(target, commentId, comment.likedByMe);
    } catch (error) {
      set((state) => ({ commentsByThread: { ...state.commentsByThread, [key]: apply(state.commentsByThread[key] ?? []) } }));
      throw error;
    }
  },

  /* ───────────── confessions ───────────── */
  confessions: [],
  confessionsHasLoaded: false,
  confessionsLoading: false,
  confessionsError: null,
  myConfessions: [],
  myConfessionsError: null,

  loadConfessions: async () => {
    set({ confessionsLoading: true, confessionsError: null });
    try {
      const confessions = await confessionsService.fetchApprovedConfessions();
      set({ confessions, confessionsHasLoaded: true, confessionsLoading: false });
    } catch (error) {
      set({ confessionsLoading: false, confessionsError: describeError(error, "Could not load confessions.") });
    }
  },

  loadMyConfessions: async () => {
    set({ myConfessionsError: null });
    try {
      const myConfessions = await confessionsService.fetchMyConfessions();
      set({ myConfessions, myConfessionsError: null });
    } catch (error) {
      set({ myConfessionsError: describeError(error, "Could not load your submissions.") });
    }
  },

  upsertPublicConfession: (confession) => {
    if (confession.moderationStatus !== "approved") return;
    set((state) => ({
      confessions: [confession, ...state.confessions.filter((item) => item.id !== confession.id)]
        .sort((left, right) => Date.parse(right.publishedAt ?? right.createdAt) - Date.parse(left.publishedAt ?? left.createdAt)),
    }));
  },

  submitConfession: async (input) => {
    const confession = await confessionsService.submitConfession(input);
    set((state) => ({
      confessions: confession.moderationStatus === "approved"
        ? [confession, ...state.confessions.filter((item) => item.id !== confession.id)]
            .sort((left, right) => Date.parse(right.publishedAt ?? right.createdAt) - Date.parse(left.publishedAt ?? left.createdAt))
        : state.confessions,
      myConfessions: [confession, ...state.myConfessions.filter((item) => item.id !== confession.id)],
      myConfessionsError: null,
    }));
    return confession;
  },

  publishConfessionLocally: (confession) => set((state) => {
    const approved = { ...confession, moderationStatus: "approved" as const };
    return {
      confessions: [approved, ...state.confessions.filter((item) => item.id !== approved.id)]
        .sort((left, right) => Date.parse(right.publishedAt ?? right.createdAt) - Date.parse(left.publishedAt ?? left.createdAt)),
      myConfessions: [approved, ...state.myConfessions.filter((item) => item.id !== approved.id)],
    };
  }),

  toggleReaction: async (confessionId, kind) => {
    const apply = (list: Confession[], next: ReactionKind | null) =>
      list.map((confession) => {
        if (confession.id !== confessionId) return confession;
        const reactions = { ...confession.reactions };
        if (confession.myReaction) reactions[confession.myReaction] = Math.max(0, reactions[confession.myReaction] - 1);
        if (next) reactions[next] += 1;
        return { ...confession, reactions, myReaction: next };
      });

    const current =
      get().confessions.find((item) => item.id === confessionId)?.myReaction ??
      get().myConfessions.find((item) => item.id === confessionId)?.myReaction ??
      null;
    const optimistic = current === kind ? null : kind;
    set((state) => ({
      confessions: apply(state.confessions, optimistic),
      myConfessions: apply(state.myConfessions, optimistic),
    }));
    try {
      await confessionsService.toggleReaction(confessionId, kind, current);
    } catch (error) {
      set((state) => ({
        confessions: apply(state.confessions, current),
        myConfessions: apply(state.myConfessions, current),
      }));
      throw error;
    }
  },

  /* ───────────── composer ───────────── */
  composerType: "gist",
  composerSchoolId: null,
  setComposerIntent: (type, schoolId) =>
    set((state) => ({ composerType: type, composerSchoolId: schoolId === undefined ? state.composerSchoolId : schoolId })),
}));
