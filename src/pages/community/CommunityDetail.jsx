import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  orderBy,
  query,
  addDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/community.css";

/* ===============================
   🔥 레벨 계산 함수 (앱과 동일)
=============================== */
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

  /* ===============================
     🔥 유저 역할
  =============================== */
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        setRole(snap.data().role);
      }
    });
  }, [user]);

  /* ===============================
     🔥 조회수 증가
  =============================== */
  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "community_posts", id);
    updateDoc(ref, { viewCount: increment(1) });
  }, [id]);

  /* ===============================
     🔥 게시글 구독
  =============================== */
  useEffect(() => {
    if (!id) return;

    return onSnapshot(doc(db, "community_posts", id), (snap) => {
      if (snap.exists()) {
        setPost({ id: snap.id, ...snap.data() });
      }
    });
  }, [id]);

  /* ===============================
     🔥 댓글 구독
  =============================== */
  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "community_posts", id, "comments"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [id]);

  /* ===============================
     🔥 게시글 좋아요 상태
  =============================== */
  useEffect(() => {
    if (!user || !id) return;

    const likeRef = doc(db, "community_posts", id, "likes", user.uid);

    return onSnapshot(likeRef, (snap) => {
      setLiked(snap.exists());
    });
  }, [id, user]);

  /* ===============================
     🔥 댓글 좋아요 상태
  =============================== */
  useEffect(() => {
    if (!user || comments.length === 0) return;

    const unsubscribers = comments.map((c) => {
      const ref = doc(
        db,
        "community_posts",
        id,
        "comments",
        c.id,
        "likes",
        user.uid
      );

      return onSnapshot(ref, (snap) => {
        setCommentLikes((prev) => ({
          ...prev,
          [c.id]: snap.exists(),
        }));
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [comments, user]);

  /* ===============================
     🔥 게시글 좋아요
  =============================== */
  const toggleLike = async () => {
    if (!user) return alert("로그인이 필요합니다.");

    const likeRef = doc(db, "community_posts", id, "likes", user.uid);
    const postRef = doc(db, "community_posts", id);

    if (liked) {
      await deleteDoc(likeRef);
      await updateDoc(postRef, { likeCount: increment(-1) });
    } else {
      await setDoc(likeRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(postRef, { likeCount: increment(1) });
    }
  };
const handleDeletePost = async () => {
  if (role !== "admin") return;
  if (!window.confirm("게시글을 삭제하시겠습니까?")) return;

  try {
    await deleteDoc(doc(db, "community_posts", id));
    alert("게시글이 삭제되었습니다.");
    nav("/community");
  } catch (e) {
    console.error(e);
    alert("삭제 중 오류 발생");
  }
};const handleDeleteComment = async (commentId) => {
  if (role !== "admin") return;
  if (!window.confirm("댓글을 삭제하시겠습니까?")) return;

  try {
    await deleteDoc(
      doc(db, "community_posts", id, "comments", commentId)
    );

    await updateDoc(doc(db, "community_posts", id), {
      commentCount: increment(-1),
    });

  } catch (e) {
    console.error(e);
    alert("댓글 삭제 중 오류");
  }
};
  /* ===============================
     🔥 댓글 좋아요
  =============================== */
  const toggleCommentLike = async (commentId) => {
    if (!user) return alert("로그인이 필요합니다.");

    const likeRef = doc(
      db,
      "community_posts",
      id,
      "comments",
      commentId,
      "likes",
      user.uid
    );

    const commentRef = doc(
      db,
      "community_posts",
      id,
      "comments",
      commentId
    );

    const isLiked = commentLikes[commentId];

    if (isLiked) {
      await deleteDoc(likeRef);
      await updateDoc(commentRef, {
        likeCount: increment(-1),
      });
    } else {
      await setDoc(likeRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(commentRef, {
        likeCount: increment(1),
      });
    }
  };

  /* ===============================
     🔥 댓글 작성 (앱과 동일 구조)
  =============================== */
  const handleAddComment = async () => {
    if (!user) return alert("로그인이 필요합니다.");
    if (!commentText.trim()) return alert("댓글을 입력해주세요.");

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

      await addDoc(
        collection(db, "community_posts", id, "comments"),
        {
          uid: user.uid,
          nickname,
          content: commentText.trim(),
          likeCount: 0,
          parentId: replyTo ? replyTo.id : null,
          mention: mentionNickname,
          createdAt: serverTimestamp(),
        }
      );

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
        alert("🎉 레벨 업!");
      }

      setCommentText("");
      setReplyTo(null);
    } catch (error) {
      console.log(error);
      alert("댓글 작성 오류");
    }
  };

  if (!post) return <MainLayout>불러오는 중...</MainLayout>;

  const rootComments = comments.filter((c) => !c.parentId);

  return (
    <MainLayout title="커뮤니티">
      <div className="community-detail-container">

        <button onClick={() => nav("/community")}>
          ← 뒤로가기
        </button>

        {/* 게시글 */}
        <div className="post-box">
          <h1>{post.title}</h1>
          <p>{post.content}</p>

          {/* 이미지 */}
          {post.imageUrls &&
            post.imageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt="post"
                style={{ width: "100%", marginTop: 10 }}
              />
            ))}

          <button onClick={toggleLike}>
            {liked ? "❤️" : "🤍"} {post.likeCount || 0}
          </button>
          {role === "admin" && (
  <button
    style={{ marginLeft: 10, color: "red" }}
    onClick={handleDeletePost}
  >
    🗑 게시글 삭제
  </button>
)}
        </div>

        {/* 댓글 */}
        <h3>댓글</h3>

        {rootComments.map((root) => (
          <div key={root.id} className="comment-card">

            <strong>{root.nickname}</strong>

            <p>
              {root.mention && (
                <span style={{ color: "#4F46E5" }}>
                  @{root.mention}{" "}
                </span>
              )}
              {root.content.replace(`@${root.mention || ""}`, "")}
            </p>

            <button
              onClick={() => toggleCommentLike(root.id)}
            >
              {commentLikes[root.id] ? "❤️" : "🤍"}{" "}
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

            {/* 대댓글 */}
            {comments
  .filter((c) => c.parentId === root.id)
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

        {/* 댓글 입력 */}
        {user && (
          <>
            <textarea
              value={commentText}
              onChange={(e) =>
                setCommentText(e.target.value)
              }
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