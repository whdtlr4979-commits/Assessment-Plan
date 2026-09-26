# 성취수준 PDF 올리는 폴더

이 폴더에 과목별 성취수준 PDF를 올리면 GitHub Actions 가 자동으로
`data/standards/과목명.js` 로 변환해 사이트의 과목 선택 목록에 추가합니다.

- **파일 이름 = 과목명** (예: `공통국어1.pdf`, `공통수학1.pdf`)
- 교과별 하위 폴더를 만들면 목록이 교과군으로 묶입니다 (예: `국어/공통국어1.pdf`)
- GitHub 웹 화면: 이 폴더에서 **Add file → Upload files** → PDF 끌어다 놓기 → **Commit changes**
  (한 번에 최대 100개, 파일당 25MB 이하)
- 변환 결과는 저장소의 **Actions** 탭 「성취수준 PDF 변환」에서 확인할 수 있습니다.
