// Ablemark M60 등 감열식 미니 라벨프린터는 대부분 ESC/POS 호환 명령어 세트를 사용합니다.
// Web Bluetooth API는 Chrome(Android/데스크톱)에서만 동작하며 iOS Safari는 지원하지 않습니다.
// 실제 서비스 UUID/문자 특성 UUID는 프린터 제조사 문서 확인 후 아래 상수를 교체해야 합니다.

// nRF Connect로 실제 M60 기기에서 확인한 값 (2026-07-29)
// Service: Unknown Service (ISSC/Microchip 계열 Transparent UART 패턴)
// Characteristic: WRITE, WRITE NO RESPONSE 속성을 가진 특성 사용
const PRINTER_SERVICE_UUID = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
const PRINTER_CHARACTERISTIC_UUID = "49535343-8841-43f4-a8d4-ecbe34729bb3";

let cachedDevice: BluetoothDevice | null = null;
let cachedCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export async function connectPrinter() {
  if (!("bluetooth" in navigator)) {
    throw new Error("이 기기/브라우저는 Web Bluetooth를 지원하지 않습니다. 안드로이드 Chrome을 사용해주세요.");
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "Ablemark" }, { namePrefix: "M60" }],
    optionalServices: [PRINTER_SERVICE_UUID],
  });

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

  cachedDevice = device;
  cachedCharacteristic = characteristic;
  return device.name ?? "라벨프린터";
}

export function isPrinterConnected() {
  return !!cachedDevice?.gatt?.connected;
}

// 텍스트 + QR코드를 ESC/POS 명령으로 변환해 전송 (단순화된 예시 — 실제 라벨 규격/명령셋은 M60 매뉴얼 기준 조정 필요)
export async function printItemLabel(params: { name: string; barcodeValue: string }) {
  if (!cachedCharacteristic) {
    throw new Error("프린터가 연결되어 있지 않습니다. 먼저 프린터를 연결해주세요.");
  }

  const encoder = new TextEncoder();
  const commands: number[] = [];

  const ESC = 0x1b;
  const GS = 0x1d;

  // 초기화
  commands.push(ESC, 0x40);

  // 품목명 텍스트 출력 (가운데 정렬)
  commands.push(ESC, 0x61, 0x01);
  commands.push(...Array.from(encoder.encode(params.name + "\n")));

  // QR 코드 모델 선택 (모델2)
  commands.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // QR 코드 모듈 크기 선택 (크기 6)
  commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  // QR 코드 오류 정정 레벨 선택 (레벨 M = 0x31)
  commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);

  // QR 코드 데이터 저장
  const qrData = encoder.encode(params.barcodeValue);
  const storeLen = qrData.length + 3;
  commands.push(GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30, ...Array.from(qrData));
  commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // 출력

  // 용지 컷/피드
  commands.push(0x0a, 0x0a, 0x0a);

  const payload = new Uint8Array(commands);

  // BLE 특성 쓰기는 청크 단위 전송이 안전 (기기별 MTU 제한 고려, 180바이트 단위 예시)
  // 저가형 BLE 프린터는 협상되는 MTU가 20바이트 안팎으로 작은 경우가 많습니다.
  // 청크가 실제 MTU보다 크면 브라우저/OS가 에러 없이 조용히 잘라버려서
  // "연결은 됐는데 출력이 안 되는" 증상이 생깁니다. 작은 청크 + 약간의 딜레이로 안전하게 전송합니다.
  const CHUNK_SIZE = 20;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    await cachedCharacteristic.writeValueWithoutResponse(chunk);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
