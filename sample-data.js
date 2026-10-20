// 예시 데이터 — config.js의 APPS_SCRIPT_URL이 비어 있을 때만 쓰입니다.
// 실제 소장님 정보는 구글시트 「소장님」에 입력하세요.
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
        photo: "",
        summary: "중등 내신·고입 설명회 다수 진행 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2\n예시 경력 3",
        topics: ["중등 내신 대비 전략", "고입 준비 로드맵"],
        targets: ["중등 학부모", "중학생"],
        region: "서울·경기",
        video: "",
        photos: []
      },
      {
        name: "예시 강연자 B",
        photo: "",
        summary: "초등 학습 습관·독서 설명회 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2",
        topics: ["초등 공부 습관 만들기", "초등 독서 로드맵"],
        targets: ["초등 학부모", "초등학생"],
        region: "전국",
        video: "",
        photos: []
      },
      {
        name: "예시 강연자 C",
        photo: "",
        summary: "고등 입시 전략·대입 설명회 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2",
        topics: ["대입 수시·정시 전략", "고1 학기별 준비"],
        targets: ["중등 학부모", "고등 학부모", "고등학생"],
        region: "서울·경기·인천",
        video: "",
        photos: []
      }
    ],
    blocked: [
      { coach: "예시 강연자 A", date: plus(18) },
      { coach: "예시 강연자 A", date: plus(25) },
      { coach: "예시 강연자 B", date: plus(20) }
    ],
    // 소장님 응답 페이지(coach.html) 미리보기용 신청 1건
    request: {
      id: "SEM-20261020-001",
      coach: "예시 강연자 A",
      academy: "클럽하와이",
      director: "홍길동",
      address: "서울 강남구 대치동 123",
      region: "서울 강남구",
      target: "중등 학부모",
      attendees: "30",
      request: "고입 준비 위주로 부탁드립니다.",
      options: [
        { date: plus(22), time: "14:00" },
        { date: plus(29), time: "10:30" },
        { date: plus(32), time: "19:00" }
      ],
      deadline: new Date(Date.now() + 60 * 3600 * 1000).toISOString(),
      status: "소장님 확인중"
    }
  };
})();
