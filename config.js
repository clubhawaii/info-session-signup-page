// 페이지 설정 — 오픈 전에 이 파일만 고치면 됩니다.
window.APP_CONFIG = {
  // Google Apps Script 웹앱 주소 (README 3단계). 비워 두면 예시 데이터로 보여 주고, 신청은 저장되지 않습니다(시험 모드).
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyoK44w11pyb62hncmIlBYnHc0kPVTwujfFCy8hUd623u2XGL5r4Z4rDJIlyNwbXRS9/exec",
  // 원장님 신청 페이지를 실제로 열었는지. false면 신청 페이지만 시험 모드(예시 데이터, 저장 안 됨) — 소장님 입력·응답 페이지는 위 주소로 실제 저장
  SIGNUP_OPEN: false,

  // 카카오톡 「클럽하와이cs」 채널 주소 (예: https://pf.kakao.com/_xxxxx). 비워 두면 문구만 보이고 버튼은 숨겨집니다.
  CONTACT_URL: "https://pf.kakao.com/_xdrlwX",

  // 개인정보 보관 기간 (회사 기준으로 확정 후 입력)
  PRIVACY_RETENTION: "회사 기준 확정 후 안내",

  // 설명회 종류와 가격 (VAT 별도). 금액이 정해지지 않은 칸은 null → 화면에 "확정 필요"로 표시
  // 신청 페이지는 소장님 설명회(첫 번째) 가격으로 안내합니다. 맞춤 설명회는 금액을 담당자가 따로 정해 안내
  KINDS: [
    {
      id: "standard",
      name: "소장님 설명회",
      desc: "소장님이 등록한 설명회로 진행합니다.",
      time: "90분 ~ 2시간",
      member: [600000, 600000],
      nonmember: [1000000, 1000000]
    },
    {
      id: "custom",
      name: "우리 학원 맞춤 설명회",
      desc: "지역·학교·학원 상황에 맞춰 이 학원만을 위해 새로 준비하는 설명회입니다.",
      time: "90분 ~ 2시간",
      member: null,
      nonmember: null,
      note: "담당자가 내용을 확인한 뒤 금액을 따로 안내드립니다."
    }
  ],

  // 지방 출장비 (일정 확정 후 청구)
  TRAVEL_FEE: 100000,

  // 진행일까지 최소 남아야 하는 날 수 (14 = 오늘로부터 딱 2주 뒤 날짜부터 선택 가능)
  MIN_DAYS: 14,
  // 맞춤 설명회 — 소장님마다 설명회 목록 끝에 붙는 선택지. 새로 준비하므로 진행일까지 최소 날 수가 더 김 (Code.gs의 CUSTOM_NAME·CUSTOM_MIN_DAYS와 같게)
  CUSTOM_NAME: "우리 학원 맞춤 설명회",
  CUSTOM_MIN_DAYS: 21,
  // 이 날 수보다 가까운 날짜를 고르면 안내를 띄움
  WARN_DAYS: 21,

  // 시작 시간 직접 입력 범위 (시) — 이 사이에서 10분 단위로 고름
  START_HOURS: [8, 21],
  MINUTE_STEP: 10,

  // 원장님이 한 번에 고를 수 있는 소장님 수. 시트 스크립트(Code.gs)의 MAX_PICKS와 같게
  MAX_PICKS: 3,
  // 소장님 응답 기한(시간, 밤·주말 포함). 기한 안에 답이 없으면 「불가」로 처리. 시트 스크립트(Code.gs)의 RESPONSE_HOURS와 같게
  RESPONSE_HOURS: 24,
  // 소장님이 보낸 응답을 바꿔야 할 때 연락할 본사 번호 (Code.gs의 HQ_CONTACT와 같게)
  HQ_CONTACT: "010-2939-7909",
  // 같은 날 다른 일정과 겹침 기준(시간) — 시작 시간 앞뒤로 이 시간 안이면 겹침 (설명회 약 2시간 + 이동)
  OVERLAP_HOURS: 3,

  TARGETS: ["초등 학부모", "중등 학부모", "고등 학부모", "초등학생", "중학생", "고등학생"],

  // ── 강연자 정보 입력 페이지(profile.html)와 설명회에 쓰는 목록 ──
  // 영역(대분류) → 주제 카테고리. page: "edu" = 이 신청 페이지, "biz" = 나중에 열 비즈니스 교육 페이지
  AREAS: [
    { name: "학부모 설명회", page: "edu", cats: ["고교선택", "중학 학교분석", "학년 전환", "고교학점제·선택과목", "대입 전략"] },
    { name: "학생 특강", page: "edu", cats: ["공부법·자기주도학습", "진로·진학", "자소서·면접"] },
    { name: "강사·조직원 교육", page: "biz", cats: ["상담·CS", "관리 공통기준", "학부모 커뮤니케이션", "마인드셋·태도"] },
    { name: "원장 경영 교육", page: "biz", cats: ["마케팅·홍보", "AI·미니앱 활용", "설명회 기획·운영", "경영 전략·리더십"] },
    { name: "단체·연합회 특강", page: "biz", cats: ["연합회·스터디 모임", "기업·기관 교육"] }
  ],
  TOPIC_TARGETS: ["초등 학부모", "중등 학부모", "고등 학부모", "초등학생", "중학생", "고등학생", "강사·직원", "원장", "기업·기관·단체"],
  SEASONS: ["상시", "1학기 초", "1학기 말", "여름방학", "2학기 초", "2학기 말", "겨울방학"],
  // 소장님이 넣을 수 있는 링크 — 클럽하와이·이즈유 유튜브, 클럽하와이 블로그에 있는 본인 영상·글만 (다른 채널·회사 콘텐츠 홍보를 막음). Code.gs와 같게
  LINK_TYPES: ["클럽하와이 유튜브", "이즈유 유튜브", "클럽하와이 블로그"],
  // 받을 수 있는 유튜브 채널 (두 유튜브 구분 모두 이 채널들 영상이면 통과)
  CH_YOUTUBES: [
    { name: "클럽하와이", handle: "@ISYOUHAWAII", id: "UCpPQizkoUXzT-xN_ELtEMfA" },     // https://www.youtube.com/@ISYOUHAWAII
    { name: "이즈유", handle: "@isyou_official", id: "UCf3dybFyWD4TPmwvzFpyIHQ" }      // https://www.youtube.com/@isyou_official
  ],
  CH_BLOG: "isyou0943",                     // https://blog.naver.com/isyou0943
  // 슬로건 글자 수 — 이 수보다 짧게 (브랜딩 이미지 슬로건 중 가장 긴 45자를 반올림한 50)
  SLOGAN_MAX: 50,
  // 강연자 개인정보 보유·이용 기간 (입력 페이지 「개인정보 수집·이용 동의」에 그대로 보임 — 회사 기준 확인 필요)
  COACH_RETENTION: "클럽하와이 강연자 활동 종료 시까지 (삭제를 요청하시면 지체 없이 파기)",
  MAX_PHOTOS: 5
};
