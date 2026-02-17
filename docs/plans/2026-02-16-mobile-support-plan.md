# Mobile Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the game fully playable on mobile browsers with virtual joystick, action buttons, and responsive HUD — while keeping PC experience unchanged.

**Architecture:** Client-only changes. New `mobile.js` IIFE module handles touch input and mobile UI. `input.js` merges joystick + keyboard. CSS media queries for responsive HUD. Server receives same `{up,down,left,right}` input — zero protocol changes.

**Tech Stack:** Vanilla JS, CSS media queries, Touch Events API, visualViewport API

---

### Task 1: Create mobile.js — Device Detection + Virtual Joystick

**Files:**
- Create: `public/js/mobile.js`

The core mobile module with joystick touch handling.

### Task 2: Modify input.js — Merge Joystick Input

**Files:**
- Modify: `public/js/input.js`

Add `joystickInput` state + `setJoystickInput()` method. Merge into `getInput()`.

### Task 3: Add Mobile HTML + Script Tag

**Files:**
- Modify: `public/index.html`

Insert mobile controls container (joystick zone + action buttons) and script tag.

### Task 4: Add Mobile CSS + Responsive Media Queries

**Files:**
- Modify: `public/css/style.css`

Mobile controls styling, joystick visuals, responsive HUD breakpoints.

### Task 5: Modify main.js — Mobile Initialization + Button Handlers

**Files:**
- Modify: `public/js/main.js`

Initialize Mobile module, wire up action buttons (chat, evolve, menu), landscape hint.

### Task 6: Mobile Chat Optimization

**Files:**
- Modify: `public/css/style.css` (mobile chat bottom-sheet)

Chat panel as bottom-sheet on mobile, keyboard avoidance, larger touch targets.
