# art239

소속 없는 작가의 원화를 살 수 있는 자리로 옮기는 마켓 랜딩.
단일 `index.html` + `api/submit.js`, Vercel 자동 배포.

## 데이터 파일 — 여기만 고치면 페이지가 바뀝니다

### `works.json` — 판매 중인 작품

```json
[{
  "id": "w-2026-001",
  "title": "여름 오후 3시",
  "artist": "김서연",
  "artistNote": "회화 전공 4학년. 빛이 방에 들어오는 시간을 그립니다.",
  "year": 2026,
  "medium": "캔버스에 유채",
  "size": "45.5 × 53.0 cm (10호)",
  "price": 280000,
  "status": "available",
  "images": ["works/w-2026-001/main.jpg",
             "works/w-2026-001/detail.jpg",
             "works/w-2026-001/room.jpg"],
  "tags": ["회화", "추상"],
  "framed": false
}]
```

- `status` — `available` / `reserved`(예약중 배지) / `sold`(판매됨 배지 + 채도 down)
- **팔린 작품도 내리지 마세요.** 거래가 실제로 일어난다는 증거입니다
- `images` 순서 고정 — ① 작품 정면 전체 ② 질감 클로즈업 ③ 벽에 걸린 상태
- 이미지는 `works/{id}/` 에 커밋. 가로 1600px 권장
- 작품이 **12점 이상**이 되면 가격·재료 필터가 자동으로 나타납니다
- 각 작품은 `주소/#작품ID` 로 바로 열립니다 (인스타 링크에 쓰세요)

### `founding-artists.json` — 초기 입점 10인

```json
{ "capacity": 10,
  "artists": [{ "name": "김서연", "joinedAt": "2026-09-01", "instagram": "@seoyeon_paints" }] }
```

- **실제 등록한 작가만 넣으세요.** 자리 채우기용 가짜 이름은 절대 넣지 마세요.
  비어 있는 게 정직하고, 정직한 게 이 페이지의 유일한 자산입니다
- 10명이 차면 문구와 수수료 안내가 자동으로 바뀝니다
- `instagram` 은 선택. 이름 아래 작게 붙습니다

## 미리보기

- `주소/` — 실제 데이터 (`works.json`, `founding-artists.json`)
- `주소/?demo=1` — **샘플 데이터**로 렌더링 확인.
  샘플 이미지에는 `SAMPLE` 이 찍혀 있어 실제 재고와 헷갈릴 일이 없습니다

## 작가 등록 폼 (Tally)

`index.html` 의 `TALLY_FORM_ID` 상수에 폼 ID만 넣으면 임베드됩니다.
비어 있으면 인스타 DM 안내 문구가 대신 나옵니다.

Tally 폼에 반드시 넣을 필수 동의 3개:

```
□ 실물이 존재하는 본인의 작업입니다.
□ 게시 전 art239가 사진 밝기·크롭을 보정하는 데 동의합니다.
□ 초기 입점 작가로 페이지에 이름(또는 활동명)이 공개되는 데 동의합니다.
```

## api/submit.js

`type` 으로 갈라집니다.

| type | 어디서 | 필수 |
|---|---|---|
| `purchase` | 작품 모달의 구매 신청 | name, contact, region |
| `storage_notify` | 수장고 알림 신청 | contact |

작가 등록은 Tally 가 직접 처리하므로 여기를 거치지 않습니다.

환경변수: `SHEET_WEBHOOK_URL`, `SHEET_SECRET`, `RESEND_API_KEY`, `NOTIFY_EMAIL`
(하나도 없으면 서버 로그로만 남습니다)
