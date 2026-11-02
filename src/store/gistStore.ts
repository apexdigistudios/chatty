import { create } from "zustand";
import { describeError } from "../lib/supabase";
import * as confessionsService from "../services/confessionsService";
import * as postsService from "../services/postsService";
import * as schoolsService from "../services/schoolsService";
import type {
  Comment,
  Confession,
  ConfessionCategory,
  Post,
  ReactionKind,
  School,
} from "../types/models";

/**
 * Client cache over the Supabase services. Nothing here is seeded — every
 * array starts empty and is filled by the network.
 */

export type ComposerType = "gist" | "confession";

const PAGE_SIZE = 10;

interface GistState {
  /* schools */
  schools: School[];
  schoolsLoading: boolean;
  schoolsError: string | null;
  loadSchools: () => Promise<void>;
  upsertSchool: (school: School) => void;
  createSchool: (input: schoolsService.CreateSchoolInput) => Promise<School>;
  claimSchool: (schoolId: string, userId: string) => Promise<void>;

  /* feed */
  posts: Post[];
  feedLoading: boolean;
  feedLoadingMore: boolean;
  feedError: string | null;
  feedHasMore: boolean;
  feedSchoolId: string | null;
  trendingPosts: Post[];
  trendingFallback: Post[];
  trendingLoading: boolean;
  trendingThreshold: number;
  setFeedSchool: (schoolId: string | null) => void;
  loadFeed: (options?: { silent?: boolean }) => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  loadTrending: () => Promise<void>;
  createPost: (input: postsService.CreatePostInput) => Promise<Post>;
  toggleLike: (postId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  patchPost: (postId: string, patch: Partial<Post>) => void;
  removePostLocally: (postId: string) => void;

  /* comments */
  commentsByPostId: Record<string, Comment[]>;
  commentsLoading: Record<string, boolean>;
  activeCommentPostId: string | null;
  openComments: (postId: string) => void;
  closeComments: () => void;
  loadComments: (postId: string) => Promise<void>;
  addComment: (postId: string, content: string) => Promise<void>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;

  /* confessions */
  confessions: Confession[];
  confessionsLoading: boolean;
  confessionsError: string | null;
  myConfessions: Confession[];
  loadConfessions: () => Promise<void>;
  loadMyConfessions: () => Promise<void>;
  submitConfession: (input: { content: string; category: ConfessionCategory; schoolId: string | null }) => Promise<Confession>;
  toggleReaction: (confessionId: string, kind: ReactionKind) => Promise<void>;

  /* composer intent */
  composerType: ComposerType;
  composerSchoolId: string | null;
  setComposerIntent: (type: ComposerType, schoolId?: string | null) => void;
}

export const useGistStore = create<GistState>()((set, get) => ({
  /* ───────────── schools ───────────── */
  schools: [],
  schoolsLoading: false,
  schoolsError: null,

  loadSchools: async () => {
    set({ schoolsLoading: true, schoolsError: null });
    try {
      const schools = await schoolsService.fetchSchools();
      set({ schools, schoolsLoading: false });
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
  feedLoading: false,
  feedLoadingMore: false,
  feedError: null,
  feedHasMore: true,
  feedSchoolId: null,
  trendingPosts: [],
  trendingFallback: [],
  trendingLoading: false,
  trendingThreshold: postsService.TRENDING_LIKE_THRESHOLD,

  setFeedSchool: (schoolId) => {
    if (get().feedSchoolId === schoolId) return;
    set({ feedSchoolId: schoolId, posts: [], feedHasMore: true });
    void get().loadFeed();
  },

  loadFeed: async ({ silent } = {}) => {
    const schoolId = get().feedSchoolId;
    if (!silent) set({ feedLoading: true, feedError: null });
    try {
      const posts = await postsService.fetchFeed({ schoolId, limit: PAGE_SIZE });
      // Ignore stale responses if the school filter changed mid-flight.
      if (get().feedSchoolId !== schoolId) return;
      set({ posts, feedLoading: false, feedHasMore: posts.length === PAGE_SIZE, feedError: null });
    } catch (error) {
      set({ feedLoading: false, feedError: describeError(error, "Could not load the feed.") });
    }
  },

  loadMoreFeed: async () => {
    const { feedLoadingMore, feedHasMore, posts, feedSchoolId } = get();
    if (feedLoadingMore || !feedHasMore) return;
    set({ feedLoadingMore: true });
    try {
      const organicOffset = posts.filter((post) => post.spotlightStatus !== "active").length;
      const more = await postsService.fetchFeed({
        schoolId: feedSchoolId,
        limit: PAGE_SIZE,
        offset: organicOffset,
        includeSpotlight: false,
      });
      const seen = new Set(posts.map((post) => post.id));
      set({
        posts: [...posts, ...more.filter((post) => !seen.has(post.id))],
        feedHasMore: more.length === PAGE_SIZE,
        feedLoadingMore: false,
      });
    } catch (error) {
      set({ feedLoadingMore: false, feedError: describeError(error, "Could not load more gists.") });
    }
  },

  loadTrending: async () => {
    set({ trendingLoading: true });
    try {
      const [trendingPosts, fallback] = await Promise.all([
        postsService.fetchTrendingPosts(),
        postsService.fetchTopByLikes(4),
      ]);
      set({ trendingPosts, trendingFallback: fallback, trendingLoading: false });
    } catch (error) {
      set({ trendingLoading: false, feedError: describeError(error, "Could not load trending gists.") });
    }
  },

  createPost: async (input) => {
    const post = await postsService.createPost(input);
    const { feedSchoolId } = get();
    if (!feedSchoolId || feedSchoolId === post.schoolId) {
      set((state) => ({ posts: [post, ...state.posts] }));
    }
    set((state) => ({
      schools: state.schools.map((school) =>
        school.id === post.schoolId ? { ...school, postCount: school.postCount + 1 } : school
      ),
    }));
    return post;
  },

  toggleLike: async (postId) => {
    const findPost = (): Post | undefined =>
      get().posts.find((post) => post.id === postId) ??
      get().trendingPosts.find((post) => post.id === postId) ??
      get().trendingFallback.find((post) => post.id === postId);
    const before = findPost();
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
      trendingPosts: state.trendingPosts.filter((post) => post.id !== postId),
      trendingFallback: state.trendingFallback.filter((post) => post.id !== postId),
    })),

  /* ───────────── comments ───────────── */
  commentsByPostId: {},
  commentsLoading: {},
  activeCommentPostId: null,

  openComments: (postId) => {
    set({ activeCommentPostId: postId });
    void get().loadComments(postId);
  },

  closeComments: () => set({ activeCommentPostId: null }),

  loadComments: async (postId) => {
    set((state) => ({ commentsLoading: { ...state.commentsLoading, [postId]: true } }));
    try {
      const comments = await postsService.fetchComments(postId);
      set((state) => ({
        commentsByPostId: { ...state.commentsByPostId, [postId]: comments },
        commentsLoading: { ...state.commentsLoading, [postId]: false },
      }));
      get().patchPost(postId, { commentCount: comments.length });
    } catch (error) {
      set((state) => ({ commentsLoading: { ...state.commentsLoading, [postId]: false } }));
      throw error;
    }
  },

  addComment: async (postId, content) => {
    const comment = await postsService.addComment(postId, content);
    set((state) => ({
      commentsByPostId: {
        ...state.commentsByPostId,
        [postId]: [...(state.commentsByPostId[postId] ?? []), comment],
      },
    }));
    const post = get().posts.find((item) => item.id === postId);
    if (post) get().patchPost(postId, { commentCount: post.commentCount + 1 });
  },

  deleteComment: async (postId, commentId) => {
    await postsService.deleteComment(commentId);
    set((state) => ({
      commentsByPostId: {
        ...state.commentsByPostId,
        [postId]: (state.commentsByPostId[postId] ?? []).filter((comment) => comment.id !== commentId),
      },
    }));
    const post = get().posts.find((item) => item.id === postId);
    if (post) get().patchPost(postId, { commentCount: Math.max(0, post.commentCount - 1) });
  },

  /* ───────────── confessions ───────────── */
  confessions: [],
  confessionsLoading: false,
  confessionsError: null,
  myConfessions: [],

  loadConfessions: async () => {
    set({ confessionsLoading: true, confessionsError: null });
    try {
      const confessions = await confessionsService.fetchApprovedConfessions();
      set({ confessions, confessionsLoading: false });
    } catch (error) {
      set({ confessionsLoading: false, confessionsError: describeError(error, "Could not load confessions.") });
    }
  },

  loadMyConfessions: async () => {
    try {
      const myConfessions = await confessionsService.fetchMyConfessions();
      set({ myConfessions });
    } catch {
      set({ myConfessions: [] });
    }
  },

  submitConfession: async (input) => {
    const confession = await confessionsService.submitConfession(input);
    set((state) => ({ myConfessions: [confession, ...state.myConfessions] }));
    return confession;
  },

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
