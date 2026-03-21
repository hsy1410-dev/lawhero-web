import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/community.css";

function calculateLevel(postCount = 0, commentCount = 0) {
  if (postCount >= 500 && commentCount >= 1000) return 5;
  if (postCount >= 300 && commentCount >= 500) return 4;
  if (postCount >= 100 && commentCount >= 100) return 3;
  if (postCount >= 30 && commentCount >= 30) return 2;
  if (postCount >= 1 && commentCount >= 1) return 1;
  return 0;
}

export default function CommunityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = auth.currentUser;

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(false);
  const [commentLikes, setCommentLikes] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [role, setRole] = useState("");

  useEffect(() => {
    if (!user) {
      setRole("");
      return;
    }

    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        setRole(snap.data().role || "");
      }
    });
  }, [user]);

  useEffect(() => {
    if (!id) return;

    const ref = doc(db, "community_posts", id);
    updateDoc(ref, { viewCount: increment(1) });
  }, [id]);

  useEffect(() => {
    if (!id) return;

    return onSnapshot(doc(db, "community_posts", id), (snap) => {
      if (snap.exists()) {
        setPost({ id: snap.id, ...snap.data() });
      }
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const commentsQuery = query(
      collection(db, "community_posts", id, "comments"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(commentsQuery, (snap) => {
      setComments(
        snap.docs.map((commentDoc) => ({
          id: commentDoc.id,
          ...commentDoc.data(),
        }))
      );
    });
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;

    const likeRef = doc(db, "community_posts", id, "likes", user.uid);

    return onSnapshot(likeRef, (snap) => {
      setLiked(snap.exists());
    });
  }, [id, user]);

  useEffect(() => {
    if (!user || comments.length === 0) return;

    const unsubscribers = comments.map((comment) => {
      const ref = doc(
        db,
        "community_posts",
        id,
        "comments",
        comment.id,
        "likes",
        user.uid
      );

      return onSnapshot(ref, (snap) => {
        setCommentLikes((prev) => ({
          ...prev,
          [comment.id]: snap.exists(),
        }));
      });
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [comments, id, user]);

  const isPostAuthor = (targetPost) =>
    Boolean(
      user &&
        targetPost &&
        (targetPost.authorId === user.uid || targetPost.uid === user.uid)
    );

  const toggleLike = async () => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const likeRef = doc(db, "community_posts", id, "likes", user.uid);
    const postRef = doc(db, "community_posts", id);

    if (liked) {
      await deleteDoc(likeRef);
      await updateDoc(postRef, { likeCount: increment(-1) });
      return;
    }

    await setDoc(likeRef, {
      uid: user.uid,
      createdAt: serverTimestamp(),
    });
    await updateDoc(postRef, { likeCount: increment(1) });
  };

  const handleDeletePost = async () => {
    const canDelete = role === "admin" || isPostAuthor(post);

    if (!canDelete) return;
    if (!window.confirm("게시글을 삭제하시겠습니까?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "community_posts", id));
      alert("게시글이 삭제되었습니다.");
      nav("/community");
    } catch (error) {
      console.error(error);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (role !== "admin") return;
    if (!window.confirm("댓글을 삭제하시겠습니까?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "community_posts", id, "comments", commentId));
      await updateDoc(doc(db, "community_posts", id), {
        commentCount: increment(-1),
      });
    } catch (error) {
      console.error(error);
      alert(
        "댓글 삭제 중 오류가 발생했습니다."
      );
    }
  };

  const toggleCommentLike = async (commentId) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const likeRef = doc(
      db,
      "community_posts",
      id,
      "comments",
      commentId,
      "likes",
      user.uid
    );

    const commentRef = doc(db, "community_posts", id, "comments", commentId);
    const isLiked = commentLikes[commentId];

    if (isLiked) {
      await deleteDoc(likeRef);
      await updateDoc(commentRef, {
        likeCount: increment(-1),
      });
      return;
    }

    await setDoc(likeRef, {
      uid: user.uid,
      createdAt: serverTimestamp(),
    });
    await updateDoc(commentRef, {
      likeCount: increment(1),
    });
  };

  const handleAddComment = async () => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    if (!commentText.trim()) {
      alert("댓글을 입력해주세요.");
      return;
    }

    try {
      const userRef = doc(db, "app_users", user.uid);
      const userSnap = await getDoc(userRef);

      const nickname = userSnap.exists()
        ? userSnap.data().nickname
        : "사용자";

      let mentionNickname = null;
      if (commentText.startsWith("@")) {
        const firstSpace = commentText.indexOf(" ");
        if (firstSpace !== -1) {
          mentionNickname = commentText.substring(1, firstSpace);
        }
      }

      await addDoc(collection(db, "community_posts", id, "comments"), {
        uid: user.uid,
        nickname,
        content: commentText.trim(),
        likeCount: 0,
        parentId: replyTo ? replyTo.id : null,
        mention: mentionNickname,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "community_posts", id), {
        commentCount: increment(1),
      });

      await updateDoc(userRef, {
        commentCount: increment(1),
      });

      const updatedSnap = await getDoc(userRef);
      const data = updatedSnap.data();

      const newLevel = calculateLevel(
        data.postCount || 0,
        data.commentCount || 0
      );

      if ((data.profileLevel || 0) < newLevel) {
        await updateDoc(userRef, {
          profileLevel: newLevel,
        });
        alert("레벨이 올랐습니다.");
      }

      setCommentText("");
      setReplyTo(null);
    } catch (error) {
      console.error(error);
      alert(
        "댓글 작성 중 오류가 발생했습니다."
      );
    }
  };

  if (!post) {
    return <MainLayout>불러오는 중...</MainLayout>;
  }

  const canDeletePost = role === "admin" || isPostAuthor(post);
  const imageUrls = Array.isArray(post.imageUrls)
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];
  const rootComments = comments.filter((comment) => !comment.parentId);

  return (
    <MainLayout title="커뮤니티">
      <div className="community-detail-container">
        <button onClick={() => nav("/community")}>
          목록으로 가기
        </button>

        <div className="post-box">
          <h1>{post.title}</h1>
          <p>{post.content}</p>

          {imageUrls.map((url, index) => (
            <img
              key={index}
              src={url}
              alt="post"
              style={{ width: "100%", marginTop: 10 }}
            />
          ))}

          <button onClick={toggleLike}>
            {liked ? "취소" : "좋아요"} {post.likeCount || 0}
          </button>

          {canDeletePost && (
            <button
              style={{ marginLeft: 10, color: "red" }}
              onClick={handleDeletePost}
            >
              게시글 삭제
            </button>
          )}
        </div>

        <h3>댓글</h3>

        {rootComments.map((root) => (
          <div key={root.id} className="comment-card">
            <strong>{root.nickname}</strong>

            <p>
              {root.mention && (
                <span style={{ color: "#4F46E5" }}>@{root.mention} </span>
              )}
              {root.content.replace(`@${root.mention || ""}`, "")}
            </p>

            <button onClick={() => toggleCommentLike(root.id)}>
              {commentLikes[root.id] ? "취소" : "좋아요"}{" "}
              {root.likeCount || 0}
            </button>

            {role === "admin" && (
              <button
                style={{ marginLeft: 10, color: "red" }}
                onClick={() => handleDeleteComment(root.id)}
              >
                삭제
              </button>
            )}

            <button
              onClick={() => {
                setReplyTo({ id: root.id, nickname: root.nickname });
                setCommentText(`@${root.nickname} `);
              }}
            >
              답글
            </button>

            {comments
              .filter((comment) => comment.parentId === root.id)
              .map((reply) => (
                <div key={reply.id} style={{ marginLeft: 40 }}>
                  <strong>{reply.nickname}</strong>
                  <p>{reply.content}</p>

                  {role === "admin" && (
                    <button
                      style={{ marginLeft: 10, color: "red" }}
                      onClick={() => handleDeleteComment(reply.id)}
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
          </div>
        ))}

        {user && (
          <>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="댓글 입력"
            />
            <button onClick={handleAddComment}>
              댓글 등록
            </button>
          </>
        )}
      </div>
    </MainLayout>
  );
}
