// 키보드 + 터치 조이스틱 입력 캡처 → 서버 전송 (WASD 이동 전용, 오토 전투)
const Input = (() => {
  const keys = {};
  let joystickInput = { up: false, down: false, left: false, right: false };

  const init = (canvasEl) => {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    // 우클릭 방지
    canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // 모바일 조이스틱에서 호출
  const setJoystickInput = (input) => {
    joystickInput = input;
  };

  const getInput = () => {
    // 채팅 입력 중이면 이동 입력 무시
    if (typeof Chat !== 'undefined' && Chat.isInputFocused()) {
      return { up: false, down: false, left: false, right: false };
    }
    return {
      up: !!(keys['KeyW'] || keys['ArrowUp'] || joystickInput.up),
      down: !!(keys['KeyS'] || keys['ArrowDown'] || joystickInput.down),
      left: !!(keys['KeyA'] || keys['ArrowLeft'] || joystickInput.left),
      right: !!(keys['KeyD'] || keys['ArrowRight'] || joystickInput.right),
    };
  };

  return { init, getInput, setJoystickInput };
})();
