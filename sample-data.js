// 예시 데이터 — config.js의 APPS_SCRIPT_URL이 비어 있을 때만 쓰입니다.
// 실제 소장님 정보·월별 추천은 구글시트에 입력하세요.
(function () {
  function plus(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  window.SAMPLE_DATA = {
    coaches: [
      {
        name: "예시 소장님 A",
        photo: "",
        summary: "중등 내신·고입 설명회 다수 진행 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2\n예시 경력 3",
        topics: ["중등 내신 대비 전략", "고입 준비 로드맵"],
        targets: ["중등 학부모", "중학생"],
        purposes: ["신규 모집", "입시 전략"],
        video: "",
        photos: []
      },
      {
        name: "예시 소장님 B",
        photo: "",
        summary: "초등 학습 습관·독서 설명회 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2",
        topics: ["초등 공부 습관 만들기", "초등 독서 로드맵"],
        targets: ["초등 학부모", "초등학생"],
        purposes: ["신규 모집", "학습 습관"],
        video: "",
        photos: []
      },
      {
        name: "예시 소장님 C",
        photo: "",
        summary: "고등 입시 전략·대입 설명회 (예시 문구)",
        career: "예시 경력 1\n예시 경력 2",
        topics: ["대입 수시·정시 전략", "고1 학기별 준비"],
        targets: ["중등 학부모", "고등 학부모", "고등학생"],
        purposes: ["입시 전략", "재원생 유지"],
        video: "",
        photos: []
      }
    ],
    blocked: [
      { coach: "예시 소장님 A", date: plus(18) },
      { coach: "예시 소장님 A", date: plus(25) },
      { coach: "예시 소장님 B", date: plus(20) }
    ],
    monthly: [
      { month: 1, theme: "예시 테마 (1월)", desc: "월별 추천 내용은 「월별추천」 시트에서 불러옵니다.", target: "중등 학부모", coaches: ["예시 소장님 A"] },
      { month: 2, theme: "예시 테마 (2월)", desc: "예시 설명", target: "초등 학부모", coaches: ["예시 소장님 B"] },
      { month: 3, theme: "예시 테마 (3월)", desc: "예시 설명", target: "고등 학부모", coaches: ["예시 소장님 C"] },
      { month: 4, theme: "예시 테마 (4월)", desc: "예시 설명", target: "중등 학부모", coaches: ["예시 소장님 A"] },
      { month: 5, theme: "예시 테마 (5월)", desc: "예시 설명", target: "초등 학부모", coaches: ["예시 소장님 B"] },
      { month: 6, theme: "예시 테마 (6월)", desc: "예시 설명", target: "고등 학부모", coaches: ["예시 소장님 C"] },
      { month: 7, theme: "예시 테마 (7월)", desc: "예시 설명", target: "중등 학부모", coaches: ["예시 소장님 A"] },
      { month: 8, theme: "예시 테마 (8월)", desc: "예시 설명", target: "초등 학부모", coaches: ["예시 소장님 B"] },
      { month: 9, theme: "예시 테마 (9월)", desc: "예시 설명", target: "고등 학부모", coaches: ["예시 소장님 C"] },
      { month: 10, theme: "예시 테마 (10월)", desc: "예시 설명", target: "중등 학부모", coaches: ["예시 소장님 A", "예시 소장님 C"] },
      { month: 11, theme: "예시 테마 (11월)", desc: "예시 설명", target: "초등 학부모", coaches: ["예시 소장님 B"] },
      { month: 12, theme: "예시 테마 (12월)", desc: "예시 설명", target: "고등 학부모", coaches: ["예시 소장님 C"] }
    ]
  };
})();
