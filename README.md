# 재고관리 프로그램

Next.js 16 + Supabase + Vercel 기반, 스캔·오프라인 동기화·PC/모바일 반응형을 지원하는 개인용 재고관리 앱입니다.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 내용 전체 실행
   - 테이블 생성 + Realtime 활성화(`items`, `stock_movements`)까지 한 번에 처리됩니다.
3. **Storage** 메뉴에서 `item-photos`라는 이름의 **public** 버킷 생성 (품목 사진 저장용)
4. **Project Settings → API**에서 `Project URL`과 `anon public key` 확인

## 2. 로컬 환경변수

`.env.local.example`을 복사해 `.env.local` 생성 후 값 채우기:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

```bash
npm install
npm run dev
```

## 3. GitHub + Vercel 배포

1. 이 폴더를 GitHub 저장소로 push
2. Vercel에서 해당 저장소 Import
3. Vercel 프로젝트 **Settings → Environment Variables**에 위 두 값 동일하게 등록
4. 배포 완료 후 `vercel.json`에 정의된 Cron(`/api/keepalive`, 매일 새벽 3시)이 자동 등록되어 Supabase 무료 플랜의 7일 비활성 자동 일시정지를 방지합니다.
   - Vercel Hobby 플랜은 크론 최소 주기가 1일이므로 매일 1회로 설정되어 있습니다.

## 4. 앱 설치 (PWA)

- **안드로이드(Chrome)**: 사이트 접속 후 메뉴 → "홈 화면에 추가"
- **윈도우(Chrome/Edge)**: 주소창 오른쪽 설치 아이콘 클릭 → "설치"
- 설치 후에도 웹 주소로 접속한 브라우저 창과 완전히 동일한 데이터(Supabase)를 실시간 공유합니다.

## 5. 라벨 프린터 (Ablemark M60)

- 설정 화면에서 "프린터 연결" 클릭 → 블루투스 기기 목록에서 선택
- **안드로이드 Chrome에서만 지원**됩니다 (Web Bluetooth API 제약, iOS Safari/PC는 대부분 미지원)
- `src/lib/label-printer.ts`의 서비스/문자 특성 UUID는 예시값입니다. 실제 인쇄가 안 되면 제조사 문서나 nRF Connect 앱으로 M60의 정확한 UUID를 확인해 교체해야 합니다.

## 6. 오프라인 동작

- 인터넷이 끊긴 상태에서도 스캔 후 입출고 처리가 가능합니다 (단, 오프라인 중에는 사전에 한 번이라도 온라인 상태에서 스캔/조회했던 품목만 인식 가능)
- 처리 내역은 기기 내부(IndexedDB)에 대기 상태로 쌓이고, 온라인 복귀 시 자동으로 Supabase에 동기화됩니다.
- 설정 화면에서 "지금 동기화" 버튼으로 수동 동기화도 가능합니다.

## 7. 백업 / 복원

- 설정 화면에서 전체 데이터(품목/사진 경로/이력 등)를 JSON 파일로 내려받거나, 파일을 선택해 복원할 수 있습니다.
- 사진 원본 파일 자체는 Supabase Storage에 남아있고, 백업 파일에는 경로 정보만 포함됩니다.

## 8. 실시간 연동

- PC와 모바일에서 동시에 앱을 켜두면, 한쪽에서 스캔/입출고 처리 시 Supabase Realtime을 통해 다른 쪽 화면도 자동으로 갱신됩니다.

## 아직 다듬어야 할 부분

- `label-printer.ts`의 프린터 UUID는 실제 M60 기준 값으로 교체 필요
- 오프라인 상태에서 신규 품목을 처음 스캔하는 경우 인식이 안 되는 한계 존재 (사전 캐싱 로직 보강 여지)
- 재고 실사(재고 조사) 모드 화면은 다음 단계에서 추가 예정
