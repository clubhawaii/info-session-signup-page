// 예시 데이터 — config.js의 APPS_SCRIPT_URL이 비어 있을 때만 쓰입니다.
// 실제 강연자 정보는 구글시트 「강연자」·「대표 주제」에 들어가고, 소장님은 profile.html에서 직접 고칩니다.
// (같은 폴더에 local-data.js가 있으면 그 내용을 대신 씁니다 — 실제 자료 미리보기용, 저장소에는 올리지 않음)
(function () {
  function plus(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  window.SAMPLE_DATA = {
    coaches: [
      {
        name: "예시 강연자 A",
        phone: "010-0000-0001",
        photo: "",
        branding: "",
        slogan: ["16년 고입 컨설팅 경험으로 우리 아이 고교 선택을 돕습니다", "현장에서 검증한 고입 전략"],
        history: ["현 ○○ 입시연구소 소장", "전 ○○학원 대표원장", "『예시 도서』 저자"],
        extra: ["고입 컨설팅 16년"],
        works: ["『예시 도서』 (2024)"],
        links: [
          { type: "유튜브", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          { type: "블로그", url: "https://blog.naver.com/" }
        ],
        photos: [],
        topics: [
          {
            area: "학부모 설명회", cats: ["고교선택"], name: "고교 선택의 정석",
            intro: "우리 아이 성향과 진로로 결정하는 고교 선택",
            points: ["특목·자사·일반고 장단점 비교", "고교 유형별 학생부 기재 경향과 대입 유불리"],
            targets: ["중등 학부모"], seasons: ["2학기 초", "겨울방학"]
          },
          {
            area: "학부모 설명회", cats: ["학년 전환"], name: "예비고1 탐구 키워드 선점",
            intro: "고등학교 입학 전 반드시 끝내야 할 고1 준비",
            points: ["중3 겨울방학 진로 탐색", "통합과학·통합사회 연계 탐구 주제 기획법"],
            targets: ["중등 학부모", "중학생"], seasons: ["겨울방학"]
          },
          {
            area: "학생 특강", cats: ["자소서·면접"], name: "고입 면접 실전 특강",
            intro: "제시문 기반 구술 면접 답변 구조 훈련",
            points: ["두괄식 답변 구조(논리+공감+대안)", "자사고 면접 기출 실습"],
            targets: ["중학생"], seasons: ["2학기 초"]
          }
        ]
      },
      {
        name: "예시 강연자 B",
        phone: "010-0000-0002",
        photo: "",
        branding: "",
        slogan: ["초등부터 잡는 자기주도학습 로드맵", "공부머리보다 공부습관"],
        history: ["현 ○○교육 학습코칭 대표", "초등 학습습관 프로그램 개발"],
        extra: [],
        works: [],
        links: [],
        photos: [],
        topics: [
          {
            area: "학부모 설명회", cats: ["학년 전환"], name: "예비중1 「중학교 가기 전에」",
            intro: "초등 6학년 겨울방학에 꼭 해야 할 준비",
            points: ["중학교 내신 구조 이해", "과목별 공부 순서"],
            targets: ["초등 학부모"], seasons: ["겨울방학"]
          },
          {
            area: "학생 특강", cats: ["공부법·자기주도학습"], name: "시험 대비 공부법 특강",
            intro: "시험 계획서와 결과서로 만드는 나만의 공부법",
            points: ["시험 4주 전 계획 세우기", "오답 정리법"],
            targets: ["초등학생", "중학생"], seasons: ["1학기 초", "2학기 초"]
          }
        ]
      },
      {
        name: "예시 강연자 C",
        phone: "010-0000-0003",
        photo: "",
        branding: "",
        slogan: ["15년 입학사정관 경험으로 대입 전략을 설계합니다", "입학사정관의 눈으로 보는 학생부"],
        history: ["전 ○○대학교 입학사정관 (15년)", "현 ○○입시연구소 대표"],
        extra: [],
        works: [],
        links: [],
        photos: [],
        topics: [
          {
            area: "학부모 설명회", cats: ["대입 전략"], name: "수시·정시 구조와 학년별 로드맵",
            intro: "고1부터 고3까지 시기별로 해야 할 일",
            points: ["학생부종합전형 평가 방식", "학년별 준비 로드맵"],
            targets: ["고등 학부모"], seasons: ["상시"]
          },
          {
            area: "학부모 설명회", cats: ["고교학점제·선택과목"], name: "계열별 선택과목 로드맵",
            intro: "진로에 맞춘 선택과목과 세특 연계",
            points: ["계열별 필수 이수 과목", "세특 연계 구조"],
            targets: ["중등 학부모", "고등 학부모"], seasons: ["겨울방학", "1학기 초"]
          }
        ]
      }
    ],
    blocked: [
      { coach: "예시 강연자 A", date: plus(18) },
      { coach: "예시 강연자 A", date: plus(25) },
      { coach: "예시 강연자 B", date: plus(20) }
    ],
    // 강연자 응답 페이지(coach.html) 미리보기용 요청 1건
    request: {
      id: "SEM-20261020-001",
      coach: "예시 강연자 A",
      rank: 1,
      academy: "클럽하와이",
      address: "서울 강남구 대치동 123",
      venue: "서울 강남구 대치동 123 (학원)",
      target: "중등 학부모",
      attendees: "30",
      kind: "대표 주제 설명회",
      topics: "고교 선택의 정석",
      request: "고입 준비 위주로 부탁드립니다.",
      flexible: true,
      options: [
        { date: plus(22), time: "14:00" },
        { date: plus(29), time: "10:30" },
        { date: plus(32), time: "19:00" }
      ],
      deadline: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
      status: "강연자 확인중"
    }
  };
})();
