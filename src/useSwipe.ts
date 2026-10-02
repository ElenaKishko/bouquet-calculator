// Sideways swipe to switch tabs.
//
// The element gets `touch-action: pan-y` (see .app-main in styles.css): the browser
// only scrolls vertically, so a sideways finger movement reaches us instead of
// turning into page scrolling. The direction is decided from the first few
// pixels; the screen follows the finger, and the switch happens on release if
// the swipe was long enough or quick enough.

import { useEffect, type RefObject } from 'react';

/** Movement before the gesture counts as sideways or up/down. */
const LOCK_DISTANCE = 8;
/** Sideways if horizontal movement is at least this times the vertical one (up to ~40° off). */
const HORIZONTAL_RATIO = 1.2;
/** Release distance that switches the tab… */
const SWITCH_DISTANCE = 60;
/** …or a quick flick: shorter, but fast (px per ms). */
const FLICK_DISTANCE = 25;
const FLICK_SPEED = 0.45;
/** Swipes starting this close to the screen edge belong to the system (Safari back/forward). */
const EDGE_MARGIN = 20;
/** How much the screen follows the finger (less than 1: feels like resistance). */
const FOLLOW = 0.35;

/** When swiping must not switch tabs: a panel is open, or a recording is in progress. */
function swipesBlocked(target: EventTarget | null): boolean {
  if (document.body.classList.contains('has-sheet') || document.body.dataset.recording === 'true') return true;
  return target instanceof Element && target.closest('input, textarea, select, [data-no-swipe]') != null;
}

interface Gesture {
  x: number;
  y: number;
  time: number;
  direction: 'horizontal' | 'vertical' | null;
}

/**
 * Calls onSwipe('left') or onSwipe('right') for a sideways swipe starting inside
 * `ref`. `getMoving` returns the element that follows the finger (the screen).
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  onSwipe: (direction: 'left' | 'right') => void,
  getMoving: () => HTMLElement | null,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let gesture: Gesture | null = null;

    const follow = (dx: number) => {
      const moving = getMoving();
      if (!moving) return;
      moving.style.transition = 'none';
      moving.style.transform = `translateX(${dx * FOLLOW}px)`;
    };
    const settle = () => {
      const moving = getMoving();
      if (!moving || !moving.style.transform) return;
      moving.style.transition = 'transform 160ms ease-out';
      moving.style.transform = '';
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const nearEdge = touch.clientX < EDGE_MARGIN || touch.clientX > window.innerWidth - EDGE_MARGIN;
      gesture =
        event.touches.length === 1 && !nearEdge && !swipesBlocked(event.target)
          ? { x: touch.clientX, y: touch.clientY, time: Date.now(), direction: null }
          : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.direction === null) {
        if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        gesture.direction = Math.abs(dx) >= HORIZONTAL_RATIO * Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      if (gesture.direction === 'vertical') {
        gesture = null; // an ordinary scroll: leave it to the browser
        return;
      }
      if (event.cancelable) event.preventDefault();
      follow(dx);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const current = gesture;
      gesture = null;
      settle();
      if (!current || current.direction !== 'horizontal') return;
      const dx = event.changedTouches[0].clientX - current.x;
      const speed = Math.abs(dx) / Math.max(1, Date.now() - current.time);
      if (Math.abs(dx) >= SWITCH_DISTANCE || (Math.abs(dx) >= FLICK_DISTANCE && speed >= FLICK_SPEED)) {
        onSwipe(dx < 0 ? 'left' : 'right');
      }
    };

    const onTouchCancel = () => {
      gesture = null;
      settle();
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    // Not passive: a sideways move must be able to stop the page from scrolling.
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [ref, onSwipe, getMoving]);
}
