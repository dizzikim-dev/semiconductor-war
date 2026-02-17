# Mobile Support Design

## Goal
Make the game fully playable on mobile browsers via link sharing.
PC gameplay remains 100% unchanged. All features (chat, evolution, HUD) accessible on mobile.

## Device Detection
```js
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                 || ('ontouchstart' in window && window.innerWidth < 1024);
```
- Adds `<body class="mobile">` for CSS targeting
- PC code path is completely untouched

## Mobile Controls
- **Virtual joystick**: Left bottom quadrant, touch-drag for movement
- **Action buttons**: Chat (💬), Evolve (⚡, visible at lvl 2), Menu (☰)
- Combat is auto — no aiming needed on right side

## Mobile HUD
- Always visible: minimap (small), boss info (1-line), team score
- Tab menu (☰): leaderboard | stock | kill feed (slide panel)
- In-world: HP/XP bars, buff icons (unchanged)

## Chat
- 💬 button opens slide-up panel
- visualViewport API for keyboard avoidance
- Swipe for tab switch, X for close
- Send button 44px+ touch target

## Lobby
- Larger team select buttons (48px+)
- Mobile control hints replace WASD hints
- Landscape recommendation banner

## Touch Handling
- `touch-action: none` on canvas
- preventDefault on touchstart/touchmove
- Joystick area vs UI button area separation

## No Server Changes
- Server receives same {up,down,left,right} input
- Game logic identical for mobile/PC
