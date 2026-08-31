import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { saveConsultation } from './lib/firebase'
import './App.css'

type IconName =
  | 'chat'
  | 'clipboard'
  | 'search'
  | 'file'
  | 'check'
  | 'shield'
  | 'calendar'
  | 'people'
  | 'route'

const faqs = [
  {
    question: '비용이 높은 이유가 광고비나 불필요한 운영비 때문은 아닐까요?',
    answer: [
      '탐정 서비스는 업체마다 비용 산정 기준이 크게 다릅니다. 일부 업체는 과도한 광고비나 중간 운영비가 수임료에 반영되는 경우도 있어 의뢰인이 실제 조사와 무관한 비용까지 부담하는 사례가 있습니다.',
      '탐정법인 정성은 사건의 난이도와 조사 범위, 투입 인력, 조사 기간 등을 종합적으로 검토하여 합리적인 비용을 안내해 드립니다. 불필요한 비용을 추가하거나 상담만으로 비용을 청구하지 않으며, 의뢰인이 납득할 수 있는 기준으로 충분히 설명드린 후 진행합니다.',
    ],
  },
  {
    question: '상담했던 담당자가 중간에 변경되어 사건이 제대로 전달되지 않을까 걱정됩니다.',
    answer: [
      '사건을 처음부터 이해한 담당자가 끝까지 책임지는 것은 매우 중요합니다. 담당자가 자주 변경되면 조사 방향이 달라지거나 중요한 내용이 누락될 가능성이 있으며, 의뢰인 역시 같은 내용을 반복해서 설명해야 하는 불편을 겪을 수 있습니다.',
      '탐정법인 정성은 사건을 맡은 담당자가 진행 상황을 지속적으로 관리하며, 조사 과정과 결과를 책임감 있게 수행합니다. 필요한 경우 전문 인력이 함께 협업하지만, 사건의 흐름과 소통은 일관성 있게 유지될 수 있도록 체계적으로 관리합니다.',
    ],
  },
  {
    question: '제 사건을 자격이나 경험이 부족한 직원이 처리하는 것은 아닐까요?',
    answer: [
      '민감한 사건일수록 조사 경험과 현장 대응 능력은 결과에 큰 영향을 미칩니다. 충분한 경험 없이 사건을 진행하거나 단순 행정 인력이 실질적인 조사를 담당할 경우 원하는 결과를 얻지 못하는 사례도 적지 않습니다.',
      '탐정법인 정성은 사건의 성격과 목적을 면밀히 검토한 후 적합한 조사 계획을 수립하고, 전문성을 바탕으로 체계적인 조사를 진행합니다. 의뢰인의 개인정보와 사건 내용은 철저한 보안 원칙 아래 관리하며, 신뢰를 최우선으로 생각합니다.',
    ],
  },
  {
    question: '상담을 받으면 반드시 의뢰를 해야 하나요?',
    answer: [
      '아닙니다. 상담은 의뢰를 강요하기 위한 절차가 아니라 현재 상황을 객관적으로 검토하고 가장 적절한 해결 방향을 안내해 드리기 위한 과정입니다.',
      '상담만 받아보신 후 다른 업체와 충분히 비교해 보셔도 괜찮습니다. 사건의 가능성, 예상 조사 방향, 진행 절차 등을 충분히 설명드린 뒤 의뢰 여부는 의뢰인께서 신중하게 결정하시면 됩니다. 부담 없이 상담받으시고 필요한 경우에만 진행하셔도 됩니다.',
    ],
  },
  {
    question: '예상보다 비용이 과도하게 발생하지는 않을까요?',
    answer: [
      '조사 과정에서 추가 비용이 계속 발생할까 걱정하는 분들도 많습니다. 비용 구조가 명확하지 않은 경우에는 처음 안내받은 금액보다 훨씬 많은 비용을 부담하게 되는 사례도 있습니다.',
      '탐정법인 정성은 상담 단계에서 조사 범위와 예상 기간을 충분히 설명드리고, 비용에 대한 내용을 투명하게 안내해 드립니다. 의뢰인이 충분히 이해하고 동의한 범위 내에서만 조사를 진행하며, 신뢰를 바탕으로 합리적인 서비스를 제공합니다.',
    ],
  },
  {
    question: '계약만 체결한 뒤 사건을 형식적으로 진행하는 것은 아닐까요?',
    answer: [
      '탐정 서비스를 선택할 때 가장 중요한 것은 계약 자체가 아니라 사건을 해결하기 위한 진정성과 책임감입니다. 단순히 의뢰 건수를 늘리는 데 집중하는 업체는 조사의 완성도나 소통이 부족해 만족도가 낮아질 수 있습니다.',
      '탐정법인 정성은 한 건 한 건의 사건을 단순한 업무가 아닌 의뢰인의 중요한 문제로 생각합니다. 조사 계획 수립부터 진행 과정, 결과 보고까지 책임감을 가지고 수행하며, 필요한 경우 진행 상황을 공유하여 의뢰인이 안심하고 맡기실 수 있도록 최선을 다하고 있습니다.',
    ],
  },
]

const processSteps: Array<{
  icon: IconName
  title: string
  description: ReactNode
}> = [
  { icon: 'chat', title: '상담 접수', description: <>전화·온라인을 통한<br />1:1 무료 비밀 상담</> },
  { icon: 'clipboard', title: '사건 분석', description: <>사건 특성에 맞는<br />맞춤형 조사 전략 수립</> },
  { icon: 'search', title: '전문 조사팀 운영', description: <>사건별 전문 조사 인력 배정<br />및 현장 조사 진행</> },
  { icon: 'file', title: '증거 확보 및 결과 정리', description: <>조사 내용을 객관적인<br />자료로 체계화</> },
  { icon: 'check', title: '결과 보고 및 사후 안내', description: <>조사 결과 설명과 필요한<br />후속 방향 안내</> },
  { icon: 'shield', title: '안전한 사건 종료', description: <>자료 보안 관리 및<br />서비스 완료</> },
]

const reasons: Array<{ icon: IconName; title: string; description: string }> = [
  {
    icon: 'calendar',
    title: '수임건수 제한',
    description:
      '더 많은 사건을 받기보다 한 건의 사건을 더욱 꼼꼼하게 수행하는 것을 원칙으로 합니다. 충분한 조사 시간과 인력을 확보하기 위해 일정 기간 동안 접수 가능한 사건 수를 자체적으로 관리합니다.',
  },
  {
    icon: 'people',
    title: '책임감 있는 동행',
    description:
      '상담부터 조사 과정, 결과 보고까지 의뢰인이 안심하고 진행할 수 있도록 단계별로 안내합니다. 어려운 법률 용어나 복잡한 절차도 이해하기 쉽게 설명하며 끝까지 책임감 있게 함께합니다.',
  },
  {
    icon: 'route',
    title: '맞춤 조사 전략',
    description:
      '같은 유형의 사건이라도 발생한 환경과 상황은 모두 다릅니다. 사건의 특성과 목적을 면밀히 분석해 가장 적합한 조사 방향과 전략을 수립합니다.',
  },
]

const services = [
  { title: '민간조사', en: 'Private investigation', lines: ['사건 상담 및 의뢰 검토', '공개장소 사실관계 확인', '동선 및 접촉 여부 조사', '합법적 범위 내 현장조사'] },
  { title: '증거확보', en: 'Secure evidence', lines: ['사진·영상 증거 수집', '출입 및 만남 사실 확인', '차량 동승·숙박 여부 확인', '소송 활용 가능한 자료 확보'] },
  { title: '자료분석', en: 'Data analysis', lines: ['기존 보유 자료 검토', '사실관계 분석', '증거 정리 및 보완', '조사 결과 종합 보고'] },
  { title: '법률 연계 서비스', en: 'Legal linked services', lines: ['제휴 법무법인 무료 상담', '이혼 및 상간소송 상담', '위자료·법률 절차 안내'] },
  { title: '상간 사건 대응', en: 'Handling an affair case', lines: ['상간자 특정 및 사실 확인', '내용증명 검토', '위자료 청구 검토', '이혼소송 연계 상담'] },
  { title: '맞춤형 솔루션', en: 'Customized solutions', lines: ['사건별 조사 전략 수립', '조사 진행 및 결과 보고', '사후 대응 방향 안내', '철저한 비밀보장 및 자료 관리'] },
]

const certificates = [
  { src: '/assets/certificates/certificate-05.jpg', alt: '탐정사 1급 자격증' },
  { src: '/assets/certificates/certificate-04.jpg', alt: 'PIA 탐정사 자격인증서' },
  { src: '/assets/certificates/certificate-01.jpg', alt: '2024 대한민국 소비자평가 1위 브랜드 대상' },
  { src: '/assets/certificates/certificate-02.jpg', alt: '2024 대한민국 소비자 선호 브랜드 1위 인증서' },
  { src: '/assets/certificates/certificate-03.jpg', alt: '2024 대한민국 소비자 선호 브랜드 1위 수상 인증서' },
]

const lawyers = [
  {
    name: '서지원',
    role: '변호사',
    image: '/assets/naran-seo-jiwon-transparent.png',
    careers: [
      '대한변협 인증 형사법·부동산 전문변호사',
      '경찰서 경미범죄 심사위원회 위원',
      '인천본부세관 관세심사위원·세무사',
    ],
  },
  {
    name: '최지연',
    role: '변호사',
    image: '/assets/naran-choi-jiyeon-transparent.png',
    careers: ['이화여자대학교 법학전문대학원 석사', '한국어·영어·일본어 법률 상담'],
  },
  {
    name: '정이든',
    role: '변호사',
    image: '/assets/naran-jung-ideun-transparent.png',
    careers: [
      '대한변협 인증 부동산 전문변호사',
      '이화여자대학교 법학전문대학원 석사',
      '영어·중국어 법률 상담',
    ],
  },
  {
    name: '문인정',
    role: '변호사',
    image: '/assets/naran-moon-injeong-transparent.png',
    careers: [
      '대한변협 인증 형사법 전문변호사',
      '경북대학교 행정학부 수석 졸업',
      '경북대학교 법학전문대학원',
    ],
  },
  {
    name: '강수은',
    role: '변호사',
    image: '/assets/naran-kang-sueun-transparent.png',
    careers: [
      '성균관대학교 정치외교학과 수석 졸업',
      '경북대학교 법학전문대학원',
      '영어·일본어 법률 상담',
    ],
  },
  {
    name: '이정민',
    role: '변호사',
    image: '/assets/naran-lee-jungmin-transparent.png',
    careers: [
      '대한변호사협회 미디어소통위원',
      '경기도교육청 교직원법률지원 변호사',
      '원광대학교 법학전문대학원',
    ],
  },
  {
    name: '손수정',
    role: '변호사',
    image: '/assets/naran-son-sujeong-transparent.png',
    careers: ['대법원 국선변호인', '경기도 법률상담위원', '형사법 전문분야 등록·변리사'],
  },
  {
    name: '황용상',
    role: '고문',
    image: '/assets/naran-hwang-yongsang.png',
    careers: [
      '경찰 재직 35년·수사업무 30년',
      '경찰청 국가수사본부·서울경찰청 광역수사대',
      '행정사·학교폭력상담사·탐정사',
    ],
  },
]

const reviewRows = [
  ['상간녀 소송 증거', '30대 여성의뢰인'],
  ['유흥업소 출입 증거', '40대 여성의뢰인'],
  ['직장 내 불륜 증거', '30대 남성의뢰인'],
  ['숙박업소 출입기록', '20대 여성의뢰인'],
  ['스킨십 장면 촬영', '50대 남성의뢰인'],
  ['소송활용 가능 증거', '30대 여성의뢰인'],
  ['보유자료 분석', '30대 여성의뢰인'],
]

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    chat: <><path d="M9 10h30v21H24l-9 7v-7H9z" /><circle cx="18" cy="20" r="1" /><circle cx="24" cy="20" r="1" /><circle cx="30" cy="20" r="1" /></>,
    clipboard: <><path d="M15 10h18v29H15z" /><path d="M20 10V7h8v3M19 18h10M19 24h10M19 30h6" /><path d="m28 31 8-8 3 3-8 8-5 2z" /></>,
    search: <><circle cx="21" cy="21" r="11" /><path d="m29 29 10 10" /></>,
    file: <><path d="M14 8h15l7 7v25H14z" /><path d="M29 8v8h7M19 23h12M19 29h12" /><circle cx="32" cy="35" r="6" /><path d="m29 35 2 2 4-5" /></>,
    check: <><circle cx="24" cy="24" r="17" /><path d="m16 24 6 6 11-13" /></>,
    shield: <><path d="M24 6 38 12v11c0 9-6 15-14 19-8-4-14-10-14-19V12z" /><path d="m17 24 5 5 9-10" /></>,
    calendar: <><rect x="8" y="11" width="32" height="28" rx="3" /><path d="M8 19h32M16 7v8M32 7v8M15 25h3M23 25h3M31 25h3M15 32h3M23 32h3M31 32h3" /></>,
    people: <><circle cx="18" cy="17" r="7" /><circle cx="31" cy="17" r="7" /><path d="M5 38c1-9 6-13 13-13s12 4 13 13M25 27c2-1 4-2 6-2 7 0 11 4 12 13H29" /></>,
    route: <><circle cx="13" cy="34" r="5" /><circle cx="35" cy="13" r="5" /><path d="M13 29V12h11M18 34h17V18M24 7l5 5-5 5" /></>,
  }

  return <svg className="line-icon" viewBox="0 0 48 48" aria-hidden="true">{paths[name]}</svg>
}

function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const elementRef = useRef<HTMLElement>(null)
  const [value, setValue] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? target
      : 0,
  )

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let animationFrame = 0
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return

        const startedAt = performance.now()
        const duration = 1600
        const animate = (now: number) => {
          const progress = Math.min((now - startedAt) / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 4)
          setValue(Math.round(target * eased))
          if (progress < 1) animationFrame = requestAnimationFrame(animate)
        }

        animationFrame = requestAnimationFrame(animate)
        observer.disconnect()
      },
      { threshold: 0.45 },
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationFrame)
    }
  }, [target])

  return (
    <strong ref={elementRef} aria-label={`${target}${suffix}`}>
      {value.toLocaleString('ko-KR')}<small>{suffix}</small>
    </strong>
  )
}

function revealDelay(delay: number) {
  return { '--reveal-delay': `${delay}ms` } as CSSProperties
}

function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: ReactNode }) {
  return (
    <header className="section-heading" data-reveal>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {description && <p className="section-description">{description}</p>}
    </header>
  )
}

function App() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [activeLawyer, setActiveLawyer] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const heroVideoRef = useRef<HTMLVideoElement>(null)
  const lawyerTouchStart = useRef<number | null>(null)

  useEffect(() => {
    const video = heroVideoRef.current
    if (!video) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      video.pause()
      return
    }

    // Safari only permits background autoplay when the media stays muted and inline.
    video.defaultMuted = true
    video.muted = true
    video.loop = true
    video.playsInline = true

    const attemptPlayback = () => {
      if (document.visibilityState === 'hidden') return
      void video.play().catch(() => {
        // iOS Low Power Mode can reject autoplay until the first user gesture.
      })
    }

    const removeInteractionListeners = () => {
      document.removeEventListener('pointerdown', handleUserInteraction, true)
      document.removeEventListener('touchstart', handleUserInteraction, true)
      document.removeEventListener('keydown', handleUserInteraction, true)
    }

    const handleUserInteraction = () => {
      const playback = video.play()
      if (!playback) {
        removeInteractionListeners()
        return
      }

      void playback.then(removeInteractionListeners).catch(() => {
        // Keep listening until a browser-approved interaction starts playback.
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') attemptPlayback()
    }

    video.addEventListener('canplay', attemptPlayback)
    video.addEventListener('ended', attemptPlayback)
    window.addEventListener('pageshow', attemptPlayback)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('pointerdown', handleUserInteraction, { capture: true, passive: true })
    document.addEventListener('touchstart', handleUserInteraction, { capture: true, passive: true })
    document.addEventListener('keydown', handleUserInteraction, true)
    attemptPlayback()

    return () => {
      video.removeEventListener('canplay', attemptPlayback)
      video.removeEventListener('ended', attemptPlayback)
      window.removeEventListener('pageshow', attemptPlayback)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      removeInteractionListeners()
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const timer = window.setTimeout(() => {
      setActiveLawyer((current) => (current + 1) % lawyers.length)
    }, 5200)

    return () => window.clearTimeout(timer)
  }, [activeLawyer])

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => { element.dataset.revealed = 'true' })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const element = entry.target as HTMLElement
          element.dataset.revealed = 'true'
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -9% 0px', threshold: 0.12 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setFormMessage(null)

    if (!privacyAgreed) {
      setFormMessage({ type: 'error', text: '개인정보 수집 및 이용에 동의해 주세요.' })
      return
    }

    const data = new FormData(form)
    if (String(data.get('website') ?? '').trim()) {
      form.reset()
      setPrivacyAgreed(false)
      setFormMessage({ type: 'success', text: '상담 신청이 접수되었습니다.' })
      return
    }
    setIsSubmitting(true)

    try {
      const result = await saveConsultation({
        name: String(data.get('name') ?? '').trim(),
        phone: String(data.get('phone') ?? '').trim(),
        message: String(data.get('message') ?? '').trim(),
      })
      form.reset()
      setPrivacyAgreed(false)
      setFormMessage({
        type: 'success',
        text: result.integrationsSynced
          ? '상담 신청이 접수되었습니다. 확인 후 신속히 연락드리겠습니다.'
          : '상담 신청이 안전하게 접수되었습니다. 알림 전달이 지연될 경우 전화로 먼저 연락드릴 수 있습니다.',
      })
    } catch (error) {
      const notConfigured = error instanceof Error && error.message === 'firebase-not-configured'
      setFormMessage({
        type: 'error',
        text: notConfigured
          ? '온라인 접수 설정 중입니다. 지금은 010-7631-8458로 연락해 주세요.'
          : '접수 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function showPreviousLawyer() {
    setActiveLawyer((current) => (current - 1 + lawyers.length) % lawyers.length)
  }

  function showNextLawyer() {
    setActiveLawyer((current) => (current + 1) % lawyers.length)
  }

  function handleLawyerTouchStart(event: TouchEvent<HTMLDivElement>) {
    lawyerTouchStart.current = event.touches[0]?.clientX ?? null
  }

  function handleLawyerTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (lawyerTouchStart.current === null) return

    const distance = lawyerTouchStart.current - (event.changedTouches[0]?.clientX ?? lawyerTouchStart.current)
    lawyerTouchStart.current = null

    if (Math.abs(distance) < 40) return
    if (distance > 0) showNextLawyer()
    else showPreviousLawyer()
  }

  return (
    <main>
      <section className="hero-art" id="top" aria-labelledby="hero-title">
        <div className="sr-only">
          <h1 id="hero-title">탐정법인 精誠</h1>
          <p>사건의 정확한 진실을 찾고, 의뢰인의 성공적인 내일을 함께합니다.</p>
        </div>
        <video
          ref={heroVideoRef}
          className="hero-background hero-background-video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src="/assets/building.mp4" type="video/mp4" />
        </video>
        <header className="hero-mobile-header">
          <a className="hero-mobile-brand" href="#top" aria-label="탐정법인 정성 홈">
            <img src="/favicon.svg" alt="" />
            <span>탐정법인 <strong>정성</strong><small>JEONG SEONG</small></span>
          </a>
          <a className="hero-mobile-call" href="tel:01076318458">24시간 상담</a>
        </header>
        <div className="hero-mobile-intro" aria-hidden="true">
          <p>탐정법인</p>
          <strong>정성</strong>
          <span>
            사건의 <b>정</b>확한 진실을 찾고,<br />
            의뢰인의 <b>성</b>공적인 내일을 함께합니다.
          </span>
        </div>
        <a className="hero-mobile-cta" href="#contact">바로 상담하기</a>
        <ul className="hero-mobile-trust" aria-label="탐정법인 정성 서비스 안내">
          <li>365일 24시간 상담</li>
          <li>전국 1,300여 개 지역</li>
          <li>법무실장 출신 탐정 배치</li>
        </ul>
        <picture className="hero-overlay" aria-hidden="true">
          <source media="(max-width: 767px)" srcSet="/assets/hero-mobile.svg" />
          <img src="/assets/hero-desktop.svg" alt="" />
        </picture>
        <div
          className="hero-lawyer-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="법률 전문가 소개"
          onTouchStart={handleLawyerTouchStart}
          onTouchEnd={handleLawyerTouchEnd}
        >
          <article
            className="hero-lawyer-slide"
            key={lawyers[activeLawyer].name}
            role="group"
            aria-roledescription="slide"
            aria-label={`${activeLawyer + 1} / ${lawyers.length}`}
          >
            <div className="hero-lawyer-copy">
              <p>{lawyers[activeLawyer].role === '고문' ? 'ADVISOR' : 'LAWYER'}</p>
              <h2><strong>{lawyers[activeLawyer].name}</strong><span> {lawyers[activeLawyer].role}</span></h2>
              <ul>
                {lawyers[activeLawyer].careers.map((career) => <li key={career}>{career}</li>)}
              </ul>
            </div>
            <div
              className="hero-lawyer-photo"
              role="img"
              aria-label={`${lawyers[activeLawyer].name} ${lawyers[activeLawyer].role}`}
              style={{ backgroundImage: `url("${lawyers[activeLawyer].image}")` }}
            />
          </article>
          <div className="hero-lawyer-controls">
            <button type="button" className="hero-lawyer-arrow" onClick={showPreviousLawyer} aria-label="이전 구성원">
              <span aria-hidden="true">←</span>
            </button>
            <div className="hero-lawyer-dots" aria-label="구성원 선택">
              {lawyers.map((lawyer, index) => (
                <button
                  type="button"
                  key={lawyer.name}
                  className={index === activeLawyer ? 'is-active' : ''}
                  onClick={() => setActiveLawyer(index)}
                  aria-label={`${lawyer.name} ${lawyer.role} 보기`}
                  aria-current={index === activeLawyer ? 'true' : undefined}
                />
              ))}
            </div>
            <button type="button" className="hero-lawyer-arrow" onClick={showNextLawyer} aria-label="다음 구성원">
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <a className="hero-hotspot" href="#contact"><span className="sr-only">바로 상담하기</span></a>
      </section>

      <section className="stats section-shell" aria-labelledby="stats-title">
        <div className="wordmark" aria-label="탐정법인 정성" data-reveal>
          <span className="wordmark-symbol">J</span>
          <span><b>탐정법인</b><small>JEONG<br />SEONG</small></span>
        </div>
        <SectionTitle
          title="증거수집, 소송까지"
          description={<>승소 가능성을 고려한 전략형 증거 설계를<br />진행합니다.</>}
        />
        <div className="stat-grid" id="stats-title">
          <article data-reveal style={revealDelay(0)}><AnimatedNumber target={240} suffix="건+" /><p>탐정법인 정성의<br />사건 수행경험</p></article>
          <article data-reveal style={revealDelay(90)}><AnimatedNumber target={100} suffix="%" /><p>비밀유지<br />만족도</p></article>
          <article data-reveal style={revealDelay(180)}><AnimatedNumber target={97} suffix="%" /><p>고객<br />만족도</p></article>
          <article data-reveal style={revealDelay(270)}><AnimatedNumber target={88} suffix="%" /><p>고객님들의<br />추천율</p></article>
        </div>
      </section>

      <aside className="remark" data-reveal>
        <span>Additional Remarks</span>
        <p>포기하지 않고 끝까지 해결하려는 정성만의 집요함으로 이뤄낸 기록들.<br />이제 여러분의 문제를 해결할 차례입니다.</p>
      </aside>

      <section className="experience section-shell" aria-labelledby="experience-title">
        <SectionTitle
          title="수많은 증거수집 경험"
          description={<>신뢰할 수 있는 경력의 전문가들이 팀을 꾸려<br />효과적으로 증거를 수집하며 해결하고 있습니다.</>}
        />
        <div className="experience-layout" id="experience-title">
          <div className="experience-metrics">
            <article className="metric-card metric-satisfaction" data-reveal style={revealDelay(0)}><h3>만족도</h3><AnimatedNumber target={99} suffix="%" /></article>
            <article className="metric-card metric-cases" data-reveal style={revealDelay(100)}><h3>진행건수</h3><p>130여개 지역 전국 고객</p><AnimatedNumber target={240} suffix="건+" /></article>
            <article className="metric-card metric-referral" data-reveal style={revealDelay(200)}><h3>추천율</h3><AnimatedNumber target={88} suffix="%+" /></article>
          </div>
          <div className="review-board" data-reveal style={revealDelay(120)}>
            <div className="review-board-head"><span>현재 해결완료 사건</span><span>성별/만족도 평가</span></div>
            <div className="review-rows">
              {reviewRows.map(([caseName, customer]) => (
                <div className="review-row" key={caseName}><b>{caseName}</b><span>{customer}</span><span className="stars" aria-label="별점 5점">★★★★★</span></div>
              ))}
            </div>
            <div className="pagination" aria-label="사례 페이지"><span>‹</span><b>1</b><span>2</span><span>3</span><span>…</span><span>713</span><span>›</span></div>
          </div>
        </div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title">
        <div className="faq-inner section-shell">
          <h2 id="faq-title" data-reveal>이런 고민 하고 계신가요?</h2>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index
              return (
                <article className={`faq-item${isOpen ? ' is-open' : ''}`} key={faq.question} data-reveal style={revealDelay(index * 70)}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${index}`}
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                    >
                      <span>Q. {faq.question}</span>
                      <span className="faq-toggle" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                  </h3>
                  <div className="faq-answer" id={`faq-answer-${index}`} hidden={!isOpen}>
                    {faq.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="process section-shell" aria-labelledby="process-title">
        <SectionTitle
          eyebrow="HOW IT WORKS"
          title="업무 진행 절차"
          description={<>탐정법인 정성은 체계적인 조사 시스템을 바탕으로 상담부터<br />사건 종결까지 전 과정을 책임감 있게 수행합니다.</>}
        />
        <div className="process-grid" id="process-title">
          {processSteps.map((step, index) => (
            <article key={step.title} data-reveal style={revealDelay(index * 80)}>
              <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="icon-box"><Icon name={step.icon} /></div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reasons section-shell" aria-labelledby="reasons-title">
        <SectionTitle title="탐정법인 정성을 선택하는 이유" />
        <div className="reason-grid" id="reasons-title">
          {reasons.map((reason, index) => (
            <article key={reason.title} data-reveal style={revealDelay(index * 100)}>
              <Icon name={reason.icon} />
              <h3>{reason.title}</h3>
              <p>{reason.description}</p>
            </article>
          ))}
        </div>
        <a className="primary-button" href="#contact" data-reveal>바로 상담하기</a>
      </section>

      <section className="services section-shell" aria-labelledby="services-title">
        <SectionTitle eyebrow="OUR SERVICES" title="주요업무" description={<>기술력과 노하우를 기반으로 다양한 서비스를<br />제공합니다.</>} />
        <div className="service-grid" id="services-title">
          {services.map((service, index) => (
            <article key={service.title} className={`service-card service-card-${index + 1}`} data-reveal style={revealDelay((index % 3) * 90)}>
              <h3>{service.title}</h3>
              <p className="service-en">{service.en}</p>
              <ul>{service.lines.map((line) => <li key={line}>{line}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="credentials" aria-labelledby="credentials-title">
        <div className="credentials-copy section-shell" data-reveal>
          <p className="eyebrow">CERTIFICATION</p>
          <h2 id="credentials-title">자격증</h2>
          <p>
            정식 등록된 탐정법인, 검증된 전문 인력.<br />{' '}
            탐정법인 정성은 전문 자격을 갖춘 인력으로 구성되어 있습니다.
          </p>
        </div>

        <div className="certificate-marquee" data-reveal aria-label="자격증 및 수상 인증서 롤링 슬라이드">
          <div className="certificate-track">
            {[0, 1].map((groupIndex) => (
              <div
                className="certificate-group"
                key={groupIndex}
                aria-hidden={groupIndex === 1 ? 'true' : undefined}
              >
                {certificates.map((certificate) => (
                  <figure className="certificate-slide" key={`${groupIndex}-${certificate.src}`}>
                    <img src={certificate.src} alt={groupIndex === 0 ? certificate.alt : ''} loading="eager" />
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>

      </section>

      <section className="contact" id="contact" aria-labelledby="contact-title">
        <div className="contact-intro" data-reveal>
          <p className="eyebrow">JEONG SEONG</p>
          <h2 id="contact-title">한 건의 사건도<br />가볍게 생각하지 않습니다.</h2>
          <p>탐정법인 정성은 사건의 크기나 난이도를 구분하지 않습니다.<br />의뢰인 한 분, 한 분의 상황에 맞춘 조사와 책임 있는 대응으로<br />믿을 수 있는 결과를 만들어갑니다.</p>
          <a href="tel:01076318458">010-7631-8458</a>
        </div>
        <form className="contact-form" onSubmit={handleSubmit} data-reveal style={revealDelay(120)}>
          <label className="honeypot" aria-hidden="true">웹사이트<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
          <label>이름<sup>*</sup><input name="name" type="text" placeholder="성함을 입력해 주세요" autoComplete="name" maxLength={30} required /></label>
          <label>연락처<sup>*</sup><input name="phone" type="tel" placeholder="연락처를 입력해 주세요" autoComplete="tel" inputMode="tel" pattern="[0-9+() -]{8,20}" maxLength={20} required /></label>
          <label>문의 내용<sup>*</sup><textarea name="message" placeholder="문의하실 내용을 자유롭게 작성해주세요" maxLength={1500} required /></label>
          <label className="privacy-check"><input type="checkbox" checked={privacyAgreed} onChange={(event) => setPrivacyAgreed(event.target.checked)} /><span>개인정보 수집 및 이용에 동의합니다. <b>(필수)</b></span></label>
          <details className="privacy-note"><summary>개인정보 수집·이용 내용 보기</summary><p>상담 연락을 위해 이름, 연락처, 문의 내용을 수집하며 상담 종료 후 관련 법령 및 내부 보관 기준에 따라 안전하게 파기합니다.</p></details>
          {formMessage && <p className={`form-message ${formMessage.type}`} role="status">{formMessage.text}</p>}
          <button className="submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? '접수 중...' : '상담 신청하기'}</button>
        </form>
      </section>

      <footer className="footer"><p>© {new Date().getFullYear()} 탐정법인 정성. All rights reserved.</p><a href="#top">맨 위로</a></footer>
    </main>
  )
}

export default App
