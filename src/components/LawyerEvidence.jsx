import { useEffect, useRef, useState } from "react";
import { applicationError, fetchLawyerApplications } from "../services/lawyerApplications";
import "../styles/lawyerEvidence.css";

export default function LawyerEvidence({ uid, evidence }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), [uid]);
  const currentDocument = document?.uid === uid ? document : null;

  const openDocument = async () => {
    if (requestRef.current && !requestRef.current.signal.aborted) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await fetchLawyerApplications({ uid, document: "1" }, controller.signal);
      if (!controller.signal.aborted) setDocument({ ...data, uid });
    } catch (failure) {
      if (!controller.signal.aborted) setError(applicationError(failure));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  if (evidence && !evidence.hasDocument) {
    return <p className="lawyer-evidence-note">{evidence.method === "bar_id"
      ? "번호 제출 방식입니다. 등록번호와 발급번호를 확인해 주세요."
      : "첨부된 증빙 파일이 없습니다."}</p>;
  }
  return <div className="lawyer-evidence">
    <button type="button" onClick={openDocument} disabled={loading}>
      {loading ? "증빙 불러오는 중…" : currentDocument ? "증빙 링크 새로고침" : "앱 등록 인증 서류 확인"}
    </button>
    {error && <p className="lawyer-evidence-error" role="alert">{error}</p>}
    {currentDocument && <>
      <p><a href={currentDocument.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {currentDocument.contentType === "application/pdf" ? "PDF 원본 열기" : "이미지 원본 열기"} ↗
      </a></p>
      <p className="lawyer-evidence-note">관리자 전용 · 링크는 5분간 유효합니다. 만료되면 새로고침해 주세요.</p>
      {currentDocument.contentType.startsWith("image/") && <img src={currentDocument.url}
        alt="신청자가 제출한 변호사 인증 증빙" referrerPolicy="no-referrer"
        onError={() => setError("증빙을 표시하지 못했습니다. 링크를 새로고침해 주세요.")} />}
    </>}
  </div>;
}
