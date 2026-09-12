/* ============================================================
   ui-scare.js — ROOMS WITHIN

   Mac + Quest pause/settings + tutorial + jumpscare.

   Intended UI behaviour:
   - Normal desktop browser:
     pause controls stay hidden.
   - Desktop/Mac A-Frame fullscreen:
     use the HTML pause button + HTML pause menu.
   - Real immersive WebXR / Meta Quest:
     use the 3D VR pause button + 3D VR pause panel.

   Important:
   A-Frame's "vr-mode" is NOT enough to prove that a real headset
   session is active. Real immersive VR is detected with
   renderer.xr.isPresenting / renderer.xr.getSession().
============================================================ */


/* ============================================================
   GLOBAL PAUSE STATE
============================================================ */

let roomsPaused = false;

window.roomsPaused = false;
window.roomsInputLocked = false;


/* ============================================================
   MODE DETECTION
============================================================ */

function hasImmersiveXRSession(scene) {
  try {
    if (
      !scene ||
      !scene.renderer ||
      !scene.renderer.xr
    ) {
      return false;
    }

    const xr = scene.renderer.xr;

    if (
      xr.getSession &&
      xr.getSession()
    ) {
      return true;
    }

    return Boolean(
      xr.isPresenting
    );
  } catch (error) {
    console.warn(
      'Could not read XR session state:',
      error
    );

    return false;
  }
}


function isBrowserFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement
  );
}


function isDesktopAFrameVR(scene) {
  return Boolean(
    scene &&
    scene.is &&
    scene.is('vr-mode') &&
    !hasImmersiveXRSession(scene)
  );
}


function shouldUse3DPauseUI(scene) {
  /*
    FIX:
    Only a REAL immersive XR session gets the 3D Quest UI.

    Desktop A-Frame fullscreen must NOT come here.
  */
  return hasImmersiveXRSession(
    scene
  );
}


function shouldUseDesktopPauseUI(scene) {
  if (
    !scene ||
    hasImmersiveXRSession(scene)
  ) {
    return false;
  }

  return Boolean(
    isDesktopAFrameVR(scene) ||
    isBrowserFullscreen()
  );
}


function getPauseUIMode(scene) {
  if (shouldUse3DPauseUI(scene)) {
    return 'immersive-vr';
  }

  if (shouldUseDesktopPauseUI(scene)) {
    return 'desktop-fullscreen';
  }

  return 'normal-desktop';
}


/* ============================================================
   FOCUS-PROOF FRAME CLOCK

   window.requestAnimationFrame (what waitRoomsMilliseconds used to
   run on below, and what several ad-hoc fade loops elsewhere still
   use directly) is throttled or fully paused by the browser the
   moment the desktop window loses OS-level focus -- confirmed live:
   in VR, if the desktop browser window isn't the focused app (the
   player only has the headset on and never clicked back into the
   tab), every one of those callbacks stalls until the player clicks
   back into the browser. That explains dialogue lines never
   advancing, the standing.glb kitchen blackout sequence never
   finishing, and sitting.glb never appearing (its reveal waits on
   the standing sequence's blackout finishing first).

   A-Frame's own per-entity tick(time, deltaTime) does not have this
   problem: while a WebXR session is presenting, three.js drives the
   render loop via XRSession.requestAnimationFrame, which the
   headset's compositor keeps running at full rate regardless of the
   desktop window's OS focus (it has to -- that is what keeps the
   picture in the headset itself alive). rooms-frame-clock (attached
   directly on <a-scene> in index.html, so it is always running) is
   a tiny component that rides that frame loop and exposes a
   focus-proof millisecond clock the rest of the game can wait on
   instead of window.requestAnimationFrame / window.setTimeout.
============================================================ */

const roomsFramePendingWaits = [];

let roomsFrameClockPrevMs = null;

/*
  requestAnimationFrame-style registry -- one-shot per registration,
  callback receives the frame time and re-registers itself if it
  wants to keep animating next frame, exactly like the native API.
  Used by continuous per-frame animations (opacity fades, etc.) that
  need to keep running every frame rather than resolve once after a
  fixed delay.
*/
const roomsFrameAnimationCallbacks = new Map();

let roomsFrameAnimationNextId = 1;

function roomsFrameRequestAnimationFrame(callback) {
  const id = roomsFrameAnimationNextId++;

  roomsFrameAnimationCallbacks.set(id, callback);

  return id;
}

function roomsFrameCancelAnimationFrame(id) {
  roomsFrameAnimationCallbacks.delete(id);
}

window.roomsFrameRequestAnimationFrame = roomsFrameRequestAnimationFrame;
window.roomsFrameCancelAnimationFrame = roomsFrameCancelAnimationFrame;

AFRAME.registerComponent('rooms-frame-clock', {
  tick: function (time) {
    if (roomsFrameClockPrevMs === null) {
      roomsFrameClockPrevMs = time;
    }

    const elapsed = Math.max(0, time - roomsFrameClockPrevMs);

    roomsFrameClockPrevMs = time;

    if (roomsFrameAnimationCallbacks.size) {
      const dueCallbacks = Array.from(roomsFrameAnimationCallbacks.entries());

      dueCallbacks.forEach((entry) => {
        const id = entry[0];
        const callback = entry[1];

        roomsFrameAnimationCallbacks.delete(id);
        callback(time);
      });
    }

    if (!roomsFramePendingWaits.length) {
      return;
    }

    const paused = Boolean(
      window.roomsPaused || window.roomsInputLocked
    );

    for (let i = roomsFramePendingWaits.length - 1; i >= 0; i--) {
      const entry = roomsFramePendingWaits[i];

      if (!paused) {
        entry.remaining -= elapsed;
      }

      if (entry.remaining <= 0) {
        roomsFramePendingWaits.splice(i, 1);
        entry.resolve();
      }
    }
  }
});

/* ============================================================
   PAUSE-AWARE TIMER

   Same public API/behavior as before (resolves after `milliseconds`
   of real time, frozen while roomsPaused/roomsInputLocked is true) --
   just driven by rooms-frame-clock's tick loop above instead of
   window.requestAnimationFrame, so it keeps working in VR even when
   the desktop window is unfocused.
============================================================ */

function waitRoomsMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    roomsFramePendingWaits.push({
      remaining: Math.max(0, Number(milliseconds) || 0),
      resolve: resolve
    });
  });
}

window.waitRoomsMilliseconds =
  waitRoomsMilliseconds;

/* ============================================================
   FOCUS-PROOF setTimeout/clearTimeout REPLACEMENTS

   A cancelable, fire-and-forget counterpart to waitRoomsMilliseconds
   above, for the many call sites that need window.setTimeout's
   'schedule a callback, and be able to cancel it before it fires'
   behavior (dialogue advancing, scare scheduling, etc.) rather than
   a plain awaited delay. Same rooms-frame-clock tick loop, so it
   keeps firing in VR even while the desktop window is unfocused.
============================================================ */

let roomsFrameTimeoutNextId = 1;

function roomsFrameSetTimeout(callback, delayMs) {
  const id = roomsFrameTimeoutNextId++;

  roomsFramePendingWaits.push({
    id: id,
    remaining: Math.max(0, Number(delayMs) || 0),
    resolve: function () {
      if (typeof callback === 'function') {
        callback();
      }
    }
  });

  return id;
}

function roomsFrameClearTimeout(id) {
  if (id === null || id === undefined) {
    return;
  }

  for (let i = roomsFramePendingWaits.length - 1; i >= 0; i--) {
    if (roomsFramePendingWaits[i].id === id) {
      roomsFramePendingWaits.splice(i, 1);
    }
  }
}

window.roomsFrameSetTimeout = roomsFrameSetTimeout;
window.roomsFrameClearTimeout = roomsFrameClearTimeout;


/* ============================================================
   SOUND LABELS
============================================================ */

function updatePauseSoundLabels() {
  let muted = false;

  if (window.getRoomsAudioState) {
    const state =
      window.getRoomsAudioState();

    muted = Boolean(
      state && state.muted
    );
  } else if (
    typeof window.roomsMuted ===
    'boolean'
  ) {
    muted = window.roomsMuted;
  }

  const text = muted
    ? 'SOUND: OFF'
    : 'SOUND: ON';

  const screenButton =
    document.querySelector(
      '#screenSoundButton'
    );

  const vrLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (screenButton) {
    screenButton.textContent = text;
  }

  if (vrLabel) {
    vrLabel.setAttribute(
      'value',
      text
    );
  }
}


/* ============================================================
   AUDIO PAUSE / RESUME
============================================================ */

function pauseRoomsAudio() {
  document
    .querySelectorAll(
      '.spatial-sound'
    )
    .forEach((entity) => {
      const sound =
        entity.components.sound;

      if (
        sound &&
        sound.pauseSound
      ) {
        sound.pauseSound();
      }
    });

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (footstep) {
    footstep.pause();
  }

  if (scareFootstep) {
    scareFootstep.pause();
  }
}


function resumeRoomsAudio() {
  if (
    window.applyRoomsAudioSettings
  ) {
    window.applyRoomsAudioSettings();
  }
}


/* ============================================================
   RAYCASTER FILTER

   While paused:
   - normal world interactions are blocked.
   - VR pause controls remain targetable.
============================================================ */

function saveRaycasterObjects(entity) {
  if (
    !entity ||
    entity.__roomsSavedRayObjects !==
      undefined
  ) {
    return;
  }

  const data =
    entity.getAttribute(
      'raycaster'
    ) || {};

  entity.__roomsSavedRayObjects =
    String(
      data.objects || ''
    );
}


function setRaycasterForPause(
  entity,
  paused
) {
  if (!entity) {
    return;
  }

  saveRaycasterObjects(entity);

  entity.setAttribute(
    'raycaster',
    'objects',
    paused
      ? '.vr-control'
      : (
          entity
            .__roomsSavedRayObjects ||
          ''
        )
  );

  const raycaster =
    entity.components.raycaster;

  if (
    raycaster &&
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   PAUSE WORLD COMPONENTS
============================================================ */

function setComponentPaused(
  component,
  paused
) {
  if (!component) {
    return;
  }

  if (
    paused &&
    typeof component.pause ===
      'function'
  ) {
    component.pause();
    return;
  }

  if (
    !paused &&
    typeof component.play ===
      'function'
  ) {
    component.play();
  }
}


function pauseWorldComponents(paused) {
  const rig =
    document.querySelector('#rig');

  const cam =
    document.querySelector('#cam');

  const door =
    document.querySelector('#door');

  const living =
    document.querySelector('#living');

  const incense =
    document.querySelector(
      '#incenseStick'
    );

  const incenseTip =
    document.querySelector(
      '#incenseTip'
    );

  const mirror =
    document.querySelector('#mirror');

  if (rig) {
    setComponentPaused(
      rig.components[
        'quest-room-collider'
      ],
      paused
    );

    setComponentPaused(
      rig.components[
        'footstep-player'
      ],
      paused
    );
  }

  if (cam) {
    setComponentPaused(
      cam.components['head-bob'],
      paused
    );
  }

  if (door) {
    setComponentPaused(
      door.components['door-hinge'],
      paused
    );
  }

  if (living) {
    setComponentPaused(
      living.components['embedded-tv'],
      paused
    );
  }

  if (incense) {
    setComponentPaused(
      incense.components[
        'incense-offering'
      ],
      paused
    );
  }

  if (incenseTip) {
    /* Current incense.js smoke component. */
    setComponentPaused(
      incenseTip.components[
        'incense-smoke'
      ],
      paused
    );

    /* Safe compatibility if the separate smoke file is used later. */
    setComponentPaused(
      incenseTip.components[
        'realistic-incense-smoke'
      ],
      paused
    );
  }

  if (mirror) {
    setComponentPaused(
      mirror.components[
        'haunted-mirror'
      ],
      paused
    );
  }

  document
    .querySelectorAll('[flicker]')
    .forEach((entity) => {
      setComponentPaused(
        entity.components.flicker,
        paused
      );
    });
}


/* ============================================================
   PAUSE / RESUME GAMEPLAY
============================================================ */

function setRoomsPaused(paused) {
  roomsPaused = Boolean(paused);

  window.roomsPaused = roomsPaused;

  /*
    ui-scare.js is the only current file that writes this global.
    Other systems only READ it, so keeping it synchronized with the
    pause state is safe for the current project.
  */
  window.roomsInputLocked =
    roomsPaused;

  const scene =
    document.querySelector('a-scene');

  const rig =
    document.querySelector('#rig');

  const cam =
    document.querySelector('#cam');

  const leftHand =
    document.querySelector(
      '#leftHand'
    );

  const rightHand =
    document.querySelector(
      '#rightHand'
    );

  const cursor = cam
    ? cam.querySelector('a-cursor')
    : null;

  const immersiveXR =
    hasImmersiveXRSession(scene);

  /* ----------------------------------------------------------
     MOVEMENT

     Mac + Quest:
     - while paused / inspecting an item -> movement OFF
     - after resume / closing item info -> movement ON

     This is intentionally independent of immersiveXR because
     Quest smooth joystick locomotion is now supported alongside
     left-trigger teleport.
  ---------------------------------------------------------- */

  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      !roomsPaused
    );
  }

  /* ----------------------------------------------------------
     LOOK CONTROLS

     Keep real headset tracking alive.
     Freeze desktop mouse-look while the HTML pause menu is open.
  ---------------------------------------------------------- */

  if (
    cam &&
    !immersiveXR
  ) {
    cam.setAttribute(
      'look-controls',
      'enabled',
      !roomsPaused
    );
  }

  /* ----------------------------------------------------------
     QUEST TELEPORT
  ---------------------------------------------------------- */

  if (leftHand) {
    leftHand.setAttribute(
      'blink-controls',
      'enabled',
      !roomsPaused
    );
  }

  /* ----------------------------------------------------------
     INTERACTION RAYCASTERS
  ---------------------------------------------------------- */

  setRaycasterForPause(
    cursor,
    roomsPaused
  );

  setRaycasterForPause(
    rightHand,
    roomsPaused
  );

  /* ----------------------------------------------------------
     WORLD ANIMATION / SYSTEMS
  ---------------------------------------------------------- */

  pauseWorldComponents(
    roomsPaused
  );

  /* ----------------------------------------------------------
     AUDIO
  ---------------------------------------------------------- */

  if (roomsPaused) {
    pauseRoomsAudio();
  } else {
    resumeRoomsAudio();
  }

  /* ----------------------------------------------------------
     BROADCAST PAUSE STATE
  ---------------------------------------------------------- */

  if (scene) {
    scene.emit(
      'rooms-pause-changed',
      {
        paused: roomsPaused
      },
      false
    );
  }
}


/* ============================================================
   UI VISIBILITY HELPERS
============================================================ */

function set3DPauseButtonVisible(
  visible
) {
  const button =
    document.querySelector(
      '#vrPauseButton'
    );

  if (button) {
    button.setAttribute(
      'visible',
      Boolean(visible)
    );
  }
}


function set3DPausePanelVisible(
  visible
) {
  const panel =
    document.querySelector(
      '#vrPausePanel'
    );

  if (panel) {
    panel.setAttribute(
      'visible',
      Boolean(visible)
    );
  }
}


function setDesktopPauseButtonVisible(
  visible
) {
  const button =
    document.querySelector(
      '#screenPauseButton'
    );

  if (!button) {
    return;
  }

  button.classList.toggle(
    'is-visible',
    Boolean(visible)
  );
}


function setDesktopPauseOverlayVisible(
  visible
) {
  const overlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  if (!overlay) {
    return;
  }

  overlay.classList.toggle(
    'is-open',
    Boolean(visible)
  );
}


function hideAllPauseUI() {
  set3DPauseButtonVisible(false);
  set3DPausePanelVisible(false);
  setDesktopPauseButtonVisible(false);
  setDesktopPauseOverlayVisible(false);
}


function syncPauseUI() {
  const scene =
    document.querySelector('a-scene');

  if (!scene) {
    hideAllPauseUI();
    return;
  }

  const mode =
    getPauseUIMode(scene);

  if (mode === 'immersive-vr') {
    setDesktopPauseButtonVisible(false);
    setDesktopPauseOverlayVisible(false);

    set3DPauseButtonVisible(
      !roomsPaused
    );

    set3DPausePanelVisible(
      roomsPaused
    );

    return;
  }

  if (
    mode ===
    'desktop-fullscreen'
  ) {
    set3DPauseButtonVisible(false);
    set3DPausePanelVisible(false);

    setDesktopPauseButtonVisible(
      !roomsPaused
    );

    setDesktopPauseOverlayVisible(
      roomsPaused
    );

    return;
  }

  /* Normal browser view: no pause controls on screen. */
  hideAllPauseUI();
}


/* ============================================================
   OPEN / CLOSE PAUSE MENU
============================================================ */

function toggleRoomsPauseMenu(
  forceOpen
) {
  const scene =
    document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  const mode =
    getPauseUIMode(scene);

  /*
    The visible pause controls only exist in:
    - desktop fullscreen
    - real immersive VR

    This protects normal desktop browsing from accidentally opening
    a hidden pause overlay through an old button/event.
  */
  if (
    mode === 'normal-desktop' &&
    forceOpen !== false
  ) {
    return;
  }

  const shouldOpen =
    typeof forceOpen === 'boolean'
      ? forceOpen
      : !roomsPaused;

  setRoomsPaused(
    shouldOpen
  );

  syncPauseUI();
  updatePauseSoundLabels();
}


/* ============================================================
   RESTART

   Restart used to be a hard window.location.reload() -- a real
   browser navigation. On Quest that visibly drops the headset out
   of the WebXR session and back into flat browser chrome before
   the page comes back, and even on desktop it's a jump-cut to a
   blank page reloading -- both read as "a different page" rather
   than a game restarting.

   This resets the actual game state in place instead, on the same
   loaded page / VR session: player position, quest items and their
   altar-placement locks, the story/quest counters and checklist UI,
   the incense/offering ritual, the safe, the mirror, and both
   monster sequences. It leans on the fact that almost every
   component in this project already has a clean init()/remove()
   pair -- toggling a component's attribute off and back on re-runs
   that pair and gives it fresh internal state for free, without
   needing to hand-reset every private field.
============================================================ */

const ROOMS_RESTART_ITEM_IDS = [
  'teddy',
  'hairClipper',
  'picture',
  'incenseStick'
];

let roomsRestartSnapshot = null;

function roomsCaptureRestartSnapshot() {
  const snapshot = {};

  ROOMS_RESTART_ITEM_IDS.concat(['rig', 'cam']).forEach(function (id) {
    const entity = document.querySelector('#' + id);

    if (!entity || !entity.object3D) {
      return;
    }

    snapshot[id] = {
      position: entity.object3D.position.clone(),
      rotation: entity.object3D.rotation.clone(),
      scale: entity.object3D.scale.clone()
    };
  });

  roomsRestartSnapshot = snapshot;
}

(function scheduleRestartSnapshotCapture() {
  const scene = document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  const start = function () {
    /*
      Re-capture a few times early on so the snapshot settles on
      wherever things end up resting once any startup layout (e.g.
      the incense stick's holder placement) has finished -- nowhere
      close to how long a real player takes to reach and move
      anything, so the final capture is always the true spawn state.
    */
    [300, 800, 1500, 3000, 5000].forEach(function (delay) {
      window.setTimeout(roomsCaptureRestartSnapshot, delay);
    });
  };

  if (scene.hasLoaded) {
    start();
  } else {
    scene.addEventListener('loaded', start, { once: true });
  }
})();


function roomsReinitComponent(entity, componentName) {
  if (!entity || !entity.hasAttribute || !entity.hasAttribute(componentName)) {
    return;
  }

  try {
    const data = entity.getAttribute(componentName);
    entity.removeAttribute(componentName);
    entity.setAttribute(componentName, data === true ? '' : data);
  } catch (error) {
    console.warn('Restart: could not reinitialize "' + componentName + '":', error);
  }
}


function roomsRestartResetItemEntity(id) {
  const entity = document.querySelector('#' + id);

  if (!entity) {
    return;
  }

  try {
    if (typeof window.roomsStoryReleaseItemFromHolder === 'function') {
      window.roomsStoryReleaseItemFromHolder(entity);
    }

    if (typeof window.roomsStoryStopItemPhysics === 'function') {
      window.roomsStoryStopItemPhysics(entity);
    }

    const scene = entity.sceneEl;

    if (scene && entity.object3D.parent !== scene.object3D) {
      scene.object3D.attach(entity.object3D);
    }

    const snap = roomsRestartSnapshot && roomsRestartSnapshot[id];

    if (snap) {
      entity.object3D.position.copy(snap.position);
      entity.object3D.rotation.copy(snap.rotation);
      entity.object3D.scale.copy(snap.scale);
      entity.object3D.updateMatrixWorld(true);
    }

    if (entity.is && entity.is('grabbed')) {
      entity.removeState('grabbed');
    }

    entity.removeAttribute('data-altar-locked');
    entity.classList.remove('altar-locked');

    /*
      Placing an item on the altar removes natural-grabbable
      entirely (story.js snapItemToSlot) so it can't be re-grabbed --
      put it back, freshly initialized either way.
    */
    if (entity.hasAttribute('natural-grabbable')) {
      roomsReinitComponent(entity, 'natural-grabbable');
    } else {
      entity.setAttribute('natural-grabbable', '');
    }
  } catch (error) {
    console.warn('Restart: could not reset item "' + id + '":', error);
  }
}


function roomsRestartResetPlayer() {
  try {
    const rig = document.querySelector('#rig');
    const cam = document.querySelector('#cam');
    const rigSnap = roomsRestartSnapshot && roomsRestartSnapshot.rig;
    const camSnap = roomsRestartSnapshot && roomsRestartSnapshot.cam;

    if (rig && rigSnap) {
      rig.object3D.position.copy(rigSnap.position);
      rig.object3D.rotation.copy(rigSnap.rotation);
      rig.object3D.updateMatrixWorld(true);
    }

    if (cam && camSnap) {
      cam.object3D.position.copy(camSnap.position);
      cam.object3D.rotation.copy(camSnap.rotation);
      cam.object3D.updateMatrixWorld(true);
    }

    const movement = rig && rig.components && rig.components['movement-controls'];

    if (movement && movement.velocity) {
      movement.velocity.set(0, 0, 0);
    }
  } catch (error) {
    console.warn('Restart: could not reset player position:', error);
  }
}


function roomsRestartResetMonsters() {
  try {
    const walking = document.querySelector('#walkingMonster');

    if (walking) {
      roomsReinitComponent(walking, 'rooms-walking-monster-player');
      walking.setAttribute('position', '0 0 0');
      walking.setAttribute('rotation', '0 0 0');
      walking.setAttribute('visible', 'false');
    }

    const standing = document.querySelector('#standingMonster');

    if (standing) {
      standing.setAttribute('position', '0 0 0');
      standing.setAttribute('rotation', '0 0 0');
      standing.setAttribute('visible', 'false');
    }

    const monsterEvents = document.querySelector('[rooms-monster-events]');
    roomsReinitComponent(monsterEvents, 'rooms-monster-events');

    const jumpscare = document.querySelector('[jumpscare-controller]');
    roomsReinitComponent(jumpscare, 'jumpscare-controller');

    const scareCharacter = document.querySelector('#scare-character');

    if (scareCharacter) {
      scareCharacter.setAttribute('position', '0 0 0');
      scareCharacter.setAttribute('visible', 'false');
    }

    /*
      #sittingFigure (the ghost) fades out via cloned, mutated
      materials at the end of a playthrough (see ending.js) --
      reinit gltf-model so a restart always comes back fully
      opaque instead of picking up a stale faded-out material.
    */
    const sittingFigure = document.querySelector('#sittingFigure');

    if (sittingFigure) {
      sittingFigure.setAttribute('visible', 'false');
      roomsReinitComponent(sittingFigure, 'gltf-model');
    }
  } catch (error) {
    console.warn('Restart: could not reset monster state:', error);
  }
}


function roomsRestartResetOffering() {
  try {
    const incenseStick = document.querySelector('#incenseStick');
    roomsReinitComponent(incenseStick, 'incense-offering');

    document.querySelectorAll('[incense-smoke]').forEach(function (entity) {
      roomsReinitComponent(entity, 'incense-smoke');
    });

    const offeringManager = document.querySelector('#offeringManager');
    roomsReinitComponent(offeringManager, 'offering-layout');
    roomsReinitComponent(offeringManager, 'offering-blackout');

    const bantho = document.querySelector('#bantho');
    roomsReinitComponent(bantho, 'temporary-offering-table-smoke');
  } catch (error) {
    console.warn('Restart: could not reset incense/offering state:', error);
  }
}


function roomsRestartResetQuestUI() {
  try {
    roomsPromptState.foundItems.clear();
    roomsPromptState.inspectedItems.clear();
    roomsPromptState.incenseLit = false;
    roomsPromptState.seatedWithGhost = false;
    roomsPromptState.hoverVisible = false;
    roomsPromptState.hoverItem = null;
    roomsPromptState.hoverEntity = null;

    if (
      roomsPromptState.system &&
      typeof roomsPromptState.system.updateQuestUI === 'function'
    ) {
      roomsPromptState.system.updateQuestUI();
    }
  } catch (error) {
    console.warn('Restart: could not reset quest checklist UI:', error);
  }
}


function roomsRestartResetStory() {
  const storyEntity = document.querySelector('#story-manager');
  roomsReinitComponent(storyEntity, 'story-manager');
}


function roomsRestartResetDialogueState() {
  try {
    window.roomsGameEnded = false;
    window.roomsSafeFirstPressShown = false;
    window.roomsTvFirstOnShown = false;

    roomsPendingDialogueLines = [];

    if (roomsDialogueSubtitleInstance) {
      const instance = roomsDialogueSubtitleInstance;

      if (instance.hideTimer) {
        window.clearTimeout(instance.hideTimer);
      }

      if (instance.advanceTimer) {
        window.clearTimeout(instance.advanceTimer);
      }

      instance.queue = [];
      instance.showing = false;

      roomsSetVisible(instance.root, false);
    }

    /*
      ending.js's roomsEndingStarted guard also has to be reset
      here -- if the player pauses and restarts WHILE the ending
      sequence is armed (ghost fading, door open, walking toward
      it), that flag would otherwise stay true forever and block
      the real ending from ever running again.
    */
    roomsEndingStarted = false;

    const endingEntity = document.querySelector('[rooms-ending-sequence]');

    const endingComponent =
      endingEntity &&
      endingEntity.components &&
      endingEntity.components['rooms-ending-sequence'];

    if (endingComponent) {
      endingComponent.watchingDoor = false;

      if (endingComponent.blackout) {
        roomsSetVisible(endingComponent.blackout, false);
      }
    }
  } catch (error) {
    console.warn('Restart: could not reset dialogue state:', error);
  }
}


function roomsRestartResetSafeAndMirror() {
  try {
    const safe = document.querySelector('#safetybox');
    roomsReinitComponent(safe, 'embedded-safe');

    const mirror = document.querySelector('#mirror');
    roomsReinitComponent(mirror, 'haunted-mirror');
  } catch (error) {
    console.warn('Restart: could not reset safe/mirror state:', error);
  }
}


function softRestartRoomsWithin() {
  /*
    No snapshot yet -- restart was pressed within the first ~5s of
    load, before the first capture had a chance to run. There is
    nothing safe to reset back to, so fall back to the old hard
    reload rather than snapping things to the wrong spot.
  */
  if (!roomsRestartSnapshot) {
    window.location.reload();
    return;
  }

  if (roomsPaused) {
    setRoomsPaused(false);
  }

  hideAllPauseUI();

  ROOMS_RESTART_ITEM_IDS.forEach(roomsRestartResetItemEntity);

  roomsRestartResetOffering();
  roomsRestartResetStory();
  roomsRestartResetQuestUI();
  roomsRestartResetMonsters();
  roomsRestartResetSafeAndMirror();
  roomsRestartResetDialogueState();
  roomsRestartResetPlayer();

  window.setTimeout(syncPauseUI, 50);

  console.log('Rooms Within: soft-restarted in place (no page reload).');
}


function restartRoomsWithin() {
  softRestartRoomsWithin();
}


/* ============================================================
   EXIT
============================================================ */

async function exitRoomsWithin() {
  if (roomsPaused) {
    setRoomsPaused(false);
  }

  hideAllPauseUI();

  const scene =
    document.querySelector('a-scene');

  if (
    scene &&
    scene.is &&
    scene.is('vr-mode') &&
    scene.exitVR
  ) {
    try {
      const result = scene.exitVR();

      if (
        result &&
        typeof result.then ===
          'function'
      ) {
        await result;
      }
    } catch (error) {
      console.error(
        'Could not exit A-Frame VR mode:',
        error
      );
    }
  }

  try {
    if (
      document.fullscreenElement &&
      document.exitFullscreen
    ) {
      await document.exitFullscreen();
    } else if (
      document.webkitFullscreenElement &&
      document.webkitExitFullscreen
    ) {
      document.webkitExitFullscreen();
    }
  } catch (error) {
    console.error(
      'Could not exit browser fullscreen:',
      error
    );
  }

  window.setTimeout(
    syncPauseUI,
    50
  );
}


/* ============================================================
   MAIN MENU LOADING PROGRESS

   The START button used to be clickable the instant the page
   rendered, even though the room is built from a dozen-plus
   .glb models (tens of megabytes total) that keep streaming in
   for a while after that -- so a player could hit START and
   land in a half-built / black room with no way to tell whether
   the game was still loading or just broken.

   This tracks every [gltf-model] entity in the scene (the ones
   already in index.html, plus a short window for the handful
   monster.js creates dynamically right at startup) and keeps
   START hidden behind a "LOADING... N%" bar until they have all
   settled -- loaded OR errored, so one bad asset cannot soft-
   lock the menu forever.
============================================================ */

let roomsAssetsReady = false;


function roomsSetupMainMenuLoading() {
  const loadingWrap =
    document.querySelector('#mainMenuLoadingWrap');

  const loadingLabel =
    document.querySelector('#mainMenuLoadingLabel');

  const loadingBarFill =
    document.querySelector('#mainMenuLoadingBarFill');

  const startButton =
    document.querySelector('#mainMenuStartButton');

  const tracked = new Set();

  let settledCount = 0;

  let totalCount = 0;

  let finalized = false;


  const updateUI = () => {
    const percent =
      totalCount > 0 ?
        Math.min(
          100,
          Math.round((settledCount / totalCount) * 100)
        ) :
        100;

    if (loadingLabel) {
      loadingLabel.textContent =
        'LOADING... ' + percent + '%';
    }

    if (loadingBarFill) {
      loadingBarFill.style.width = percent + '%';
    }

    if (
      finalized &&
      percent >= 100 &&
      !roomsAssetsReady
    ) {
      roomsAssetsReady = true;

      if (loadingWrap) {
        loadingWrap.classList.add('mm-hidden');
      }

      if (startButton) {
        startButton.classList.remove('mm-hidden');
      }
    }
  };


  const trackEntity = (entity) => {
    if (
      !entity ||
      tracked.has(entity)
    ) {
      return;
    }

    tracked.add(entity);

    totalCount += 1;

    const alreadyLoaded =
      entity.getObject3D &&
      entity.getObject3D('mesh');

    if (alreadyLoaded) {
      settledCount += 1;

      updateUI();

      return;
    }

    const onSettled = () => {
      settledCount += 1;

      entity.removeEventListener('model-loaded', onSettled);

      entity.removeEventListener('model-error', onSettled);

      updateUI();
    };

    entity.addEventListener('model-loaded', onSettled);

    entity.addEventListener('model-error', onSettled);
  };


  document
    .querySelectorAll('[gltf-model]')
    .forEach(trackEntity);


  const observer =
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!node.querySelectorAll) {
            return;
          }

          if (
            node.hasAttribute &&
            node.hasAttribute('gltf-model')
          ) {
            trackEntity(node);
          }

          node
            .querySelectorAll('[gltf-model]')
            .forEach(trackEntity);
        });
      });
    });

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );


  /*
    monster.js re-runs its own setup at 100/400/1000/2000ms after
    startup, so give it that same window before locking the total
    in -- after that, whatever is tracked is what the bar counts
    toward.
  */
  window.setTimeout(
    () => {
      observer.disconnect();

      finalized = true;

      updateUI();
    },
    2200
  );

  updateUI();
}


if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    roomsSetupMainMenuLoading
  );
} else {
  roomsSetupMainMenuLoading();
}


/* ============================================================
   MAIN MENU (PRE-GAME TITLE SCREEN)

   #mainMenuOverlay (index.html) sits on top of everything else,
   showing a looping dms3.mp4 behind the title and START button.
   Clicking START is the player's first real gesture, so it also
   unlocks audio and requests VR/fullscreen in one go -- the same
   single-button pattern the rest of this project already uses
   for entering VR.
============================================================ */

let roomsMainMenuStarted = false;


async function startRoomsFromMainMenu() {
  if (
    roomsMainMenuStarted ||
    !roomsAssetsReady
  ) {
    return;
  }

  roomsMainMenuStarted = true;

  const overlay =
    document.querySelector('#mainMenuOverlay');

  if (overlay) {
    overlay.classList.add('is-hidden');

    window.setTimeout(
      () => {
        overlay.style.display = 'none';
      },
      650
    );
  }

  const video =
    document.querySelector('#mainMenuVideo');

  if (video) {
    try {
      video.pause();
    } catch (error) {
      /* ignore -- just a cosmetic cleanup */
    }
  }

  if (
    typeof window.ensureRoomsAudioUnlocked ===
      'function'
  ) {
    try {
      await window.ensureRoomsAudioUnlocked(
        'main-menu-start'
      );
    } catch (error) {
      console.error(
        'Main menu: could not unlock audio:',
        error
      );
    }
  }

  const scene =
    document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  const requestVR = async () => {
    try {
      const result = scene.enterVR();

      if (
        result &&
        typeof result.then ===
          'function'
      ) {
        await result;
      }
    } catch (error) {
      console.error(
        'Main menu: could not enter VR / fullscreen:',
        error
      );
    }
  };

  if (scene.hasLoaded) {
    await requestVR();
  } else {
    scene.addEventListener(
      'loaded',
      requestVR,
      { once: true }
    );
  }

  /*
    VR controller instructions -- shown first, in a real headset
    only (#vrControlsPanel, index.html), using the player's own
    controller diagram. The intro story lines are queued once
    the player closes it (closeRoomsControlsPanel() below) so
    they never overlap on screen. Desktop skips straight to the
    story lines -- it already explains itself via mouse + click
    and the on-screen action prompts.
  */
  window.setTimeout(
    () => {
      if (hasImmersiveXRSession(scene)) {
        showRoomsControlsPanel();
      } else {
        roomsQueueIntroLines();
      }
    },
    400
  );
}


let roomsIntroLinesQueued = false;


function roomsQueueIntroLines() {
  if (
    roomsIntroLinesQueued ||
    typeof roomsQueueDialogueLine !== 'function'
  ) {
    return;
  }

  roomsIntroLinesQueued = true;

  roomsQueueDialogueLine('Where am I? What is this place?');

  roomsQueueDialogueLine(
    'There is something wrong with this place, better get the hell out of here quickly.'
  );
}


/* ============================================================
   VR CONTROLLER INSTRUCTIONS PANEL

   #vrControlsPanel (index.html) shows the controller diagram
   image the player supplied, camera-attached like #vrPausePanel
   right next to it. Movement is locked while it is up (same
   setAttribute('movement-controls', 'enabled', ...) toggle safe.js
   uses for the keypad) so the player is not wandering blind while
   reading it. CLOSE works on desktop through the normal cursor +
   onclick, and in VR through the vr-ui-interactor hit-check added
   alongside its pause-menu buttons further down this file.

   FAILSAFE: reports from a real headset were that this could get
   stuck open -- CLOSE not registering for whatever reason (aim,
   a missed trigger event, anything) -- which is far worse than a
   cosmetic annoyance here: movement stays locked AND the intro
   lines (roomsQueueIntroLines(), only ever called from
   closeRoomsControlsPanel()) never fire, so the player is stuck
   standing still with no dialogue ever appearing and no way out
   except reloading the whole page. This panel must never be able
   to hard-block the game like that, so it auto-closes itself on a
   timer no matter what happens with the button.
============================================================ */

let roomsControlsPanelFailsafeTimer = null;


function showRoomsControlsPanel() {
  const panel =
    document.querySelector('#vrControlsPanel');

  if (!panel) {
    roomsQueueIntroLines();

    return;
  }

  panel.setAttribute('visible', true);

  const rig =
    document.querySelector('#rig');

  if (rig) {
    rig.setAttribute('movement-controls', 'enabled', false);
  }

  window.clearTimeout(roomsControlsPanelFailsafeTimer);

  roomsControlsPanelFailsafeTimer = window.setTimeout(
    () => {
      closeRoomsControlsPanel();
    },
    12000
  );
}


function closeRoomsControlsPanel() {
  window.clearTimeout(roomsControlsPanelFailsafeTimer);

  const panel =
    document.querySelector('#vrControlsPanel');

  if (panel) {
    panel.setAttribute('visible', false);
  }

  const rig =
    document.querySelector('#rig');

  if (rig) {
    rig.setAttribute('movement-controls', 'enabled', true);
  }

  roomsQueueIntroLines();
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.toggleRoomsPauseMenu =
  toggleRoomsPauseMenu;

window.startRoomsFromMainMenu =
  startRoomsFromMainMenu;

window.restartRoomsWithin =
  restartRoomsWithin;

window.exitRoomsWithin =
  exitRoomsWithin;

window.updatePauseSoundLabels =
  updatePauseSoundLabels;

window.setRoomsPaused =
  setRoomsPaused;

window.syncRoomsPauseUI =
  syncPauseUI;

window.closeRoomsControlsPanel =
  closeRoomsControlsPanel;


/* ============================================================
   CAMERA-CORNER 3D GEAR

   Used only in real immersive VR after the UI-mode fix.
============================================================ */

AFRAME.registerComponent(
  'camera-corner-ui',
  {
    schema: {
      side: {
        default: 'left',
        oneOf: [
          'left',
          'right'
        ]
      },

      verticalAnchor: {
        default: 'bottom',
        oneOf: [
          'top',
          'bottom'
        ]
      },

      distance: {
        default: 2
      },

      horizontalInset: {
        default: 0.13
      },

      verticalInset: {
        default: 0.16
      }
    },

    init: function () {
      this.lastUpdate = 0;
    },

    tick: function (time) {
      if (
        time - this.lastUpdate <
        150
      ) {
        return;
      }

      this.lastUpdate = time;

      const cameraEl =
        document.querySelector('#cam');

      const camera = cameraEl
        ? cameraEl.getObject3D(
            'camera'
          )
        : null;

      if (!camera) {
        return;
      }

      const distance =
        this.data.distance;

      const fov =
        THREE.MathUtils.degToRad(
          camera.fov || 60
        );

      const halfHeight =
        Math.tan(fov / 2) *
        distance;

      const aspect =
        camera.aspect ||
        (
          window.innerWidth /
          Math.max(
            window.innerHeight,
            1
          )
        );

      const halfWidth =
        halfHeight * aspect;

      const xMagnitude =
        halfWidth *
        (
          1 -
          this.data.horizontalInset
        );

      const yMagnitude =
        halfHeight *
        (
          1 -
          this.data.verticalInset
        );

      const x =
        this.data.side === 'left'
          ? -xMagnitude
          : xMagnitude;

      const y =
        this.data.verticalAnchor ===
        'bottom'
          ? -yMagnitude
          : yMagnitude;

      this.el.object3D.position.set(
        x,
        y,
        -distance
      );
    }
  }
);


/* ============================================================
   DESKTOP VR UI POINTER — COMPATIBILITY COMPONENT

   The old version used mouse raycasting against the 3D Quest menu
   in Mac fullscreen.

   That is intentionally no longer needed because Mac fullscreen now
   uses the HTML menu. The component stays registered because the
   current index.html still includes `desktop-vr-ui-pointer`.
============================================================ */

AFRAME.registerComponent(
  'desktop-vr-ui-pointer',
  {
    init: function () {
      /* Intentionally empty. */
    },

    remove: function () {
      const canvas =
        this.el &&
        this.el.renderer
          ? this.el.renderer.domElement
          : null;

      if (canvas) {
        canvas.style.cursor = '';
      }
    }
  }
);


/* ============================================================
   QUEST RIGHT HAND -> 3D PAUSE UI
============================================================ */

AFRAME.registerComponent(
  'vr-ui-interactor',
  {
    schema: {
      pressThreshold: {
        default: 0.65
      },

      releaseThreshold: {
        default: 0.2
      }
    },

    init: function () {
      this.triggerHeld = false;

      this.pressTrigger =
        this.pressTrigger.bind(this);

      this.releaseTrigger =
        this.releaseTrigger.bind(this);

      this.onTriggerChanged =
        this.onTriggerChanged.bind(this);

      this.el.addEventListener(
        'triggerdown',
        this.pressTrigger
      );

      this.el.addEventListener(
        'triggerup',
        this.releaseTrigger
      );

      this.el.addEventListener(
        'triggerchanged',
        this.onTriggerChanged
      );

      this.el.addEventListener(
        'controllerdisconnected',
        this.releaseTrigger
      );
    },

    pressTrigger: function (event) {
      if (this.triggerHeld) {
        return;
      }

      /*
        This interactor is ONLY for genuine immersive VR.
        It should not steal trigger presses in desktop mode.
      */
      if (
        !hasImmersiveXRSession(
          this.el.sceneEl
        )
      ) {
        return;
      }

      if (
        event &&
        event.stopPropagation
      ) {
        event.stopPropagation();
      }

      this.triggerHeld = true;
      this.useUI();
    },

    releaseTrigger: function () {
      this.triggerHeld = false;
    },

    onTriggerChanged: function (
      event
    ) {
      const value =
        event &&
        event.detail &&
        typeof event.detail.value ===
          'number'
          ? event.detail.value
          : null;

      if (value === null) {
        return;
      }

      if (
        value >=
          this.data.pressThreshold &&
        !this.triggerHeld
      ) {
        this.pressTrigger();
      } else if (
        value <=
        this.data.releaseThreshold
      ) {
        this.releaseTrigger();
      }
    },

    useUI: function () {
      if (
        !hasImmersiveXRSession(
          this.el.sceneEl
        )
      ) {
        return;
      }

      const raycaster =
        this.el.components.raycaster;

      if (!raycaster) {
        return;
      }

      if (raycaster.refreshObjects) {
        raycaster.refreshObjects();
      }

      const hit = (element) => {
        if (
          !element
        ) {
          return null;
        }

        /*
          FIX:

          #vrPauseButton draws its gear icon (ring, inner ring,
          spokes) as CHILD entities nested inside the clickable
          circle. The raycaster hits whatever geometry is
          physically closest -- often one of those decorative
          children, not the circle itself -- and each child is
          its own separate element. raycaster.getIntersection()
          only matches by strict element equality, so aiming at
          the visible icon artwork (dead center, where a player
          naturally points) silently failed to register as a
          hit on the button.

          Fix: check every currently intersected element against
          this control AND its descendants, using the ray's full
          hit list instead of a single exact-match lookup.
        */
        const intersectedEls =
          raycaster.intersectedEls ||
          [];

        for (
          let i = 0;
          i < intersectedEls.length;
          i++
        ) {
          const candidate =
            intersectedEls[i];

          if (
            candidate === element ||
            (
              element.contains &&
              element.contains(
                candidate
              )
            )
          ) {
            return true;
          }
        }

        return null;
      };

      const pauseButton =
        document.querySelector(
          '#vrPauseButton'
        );

      const pausePanel =
        document.querySelector(
          '#vrPausePanel'
        );

      const resumeButton =
        document.querySelector(
          '#vrResumeButton'
        );

      const soundButton =
        document.querySelector(
          '#vrSoundButton'
        );

      const restartButton =
        document.querySelector(
          '#vrRestartButton'
        );

      const exitButton =
        document.querySelector(
          '#vrExitButton'
        );

      if (hit(pauseButton)) {
        toggleRoomsPauseMenu();
        return;
      }

      /*
        Controller instructions panel -- independent of the
        pause menu, so check it before the pausePanel-visible
        gate below shuts everything else out.
      */
      const controlsPanel =
        document.querySelector(
          '#vrControlsPanel'
        );

      const controlsCloseButton =
        document.querySelector(
          '#vrControlsCloseButton'
        );

      if (
        controlsPanel &&
        controlsPanel.getAttribute('visible') &&
        hit(controlsCloseButton)
      ) {
        closeRoomsControlsPanel();
        return;
      }

      if (
        !pausePanel ||
        !pausePanel.getAttribute(
          'visible'
        )
      ) {
        return;
      }

      if (hit(resumeButton)) {
        toggleRoomsPauseMenu(false);
        return;
      }

      if (hit(soundButton)) {
        if (window.toggleRoomsMute) {
          window.toggleRoomsMute();
        }

        window.setTimeout(
          updatePauseSoundLabels,
          0
        );

        return;
      }

      if (hit(restartButton)) {
        restartRoomsWithin();
        return;
      }

      if (hit(exitButton)) {
        exitRoomsWithin();
      }
    },

    remove: function () {
      this.el.removeEventListener(
        'triggerdown',
        this.pressTrigger
      );

      this.el.removeEventListener(
        'triggerup',
        this.releaseTrigger
      );

      this.el.removeEventListener(
        'triggerchanged',
        this.onTriggerChanged
      );

      this.el.removeEventListener(
        'controllerdisconnected',
        this.releaseTrigger
      );
    }
  }
);

/* ============================================================
   QUEST CONTROLLER A BUTTON -> PAUSE MENU

   The on-screen gear icon was fiddly to aim a raycaster at, so
   it's gone -- the right controller's A button opens/closes the
   pause menu directly instead, same behaviour as the desktop
   'P' / Escape key. A used to double as the alternate grab
   button too (natural-grab-hand) -- that binding was removed so
   A does just this now, with no overlap.
============================================================ */

AFRAME.registerComponent(
  'vr-menu-button',
  {
    schema: {
      event: {
        default: 'abuttondown'
      }
    },

    init: function () {
      this.onButtonDown =
        this.onButtonDown.bind(this);

      this.el.addEventListener(
        this.data.event,
        this.onButtonDown
      );
    },

    onButtonDown: function () {
      /*
        Only in genuine immersive VR -- same guard as
        vr-ui-interactor, so this never fires on desktop.
      */
      if (
        !hasImmersiveXRSession(
          this.el.sceneEl
        )
      ) {
        return;
      }

      toggleRoomsPauseMenu();
    },

    remove: function () {
      this.el.removeEventListener(
        this.data.event,
        this.onButtonDown
      );
    }
  }
);

/* ============================================================
   QUEST CONTROLLER B BUTTON -> TOGGLE OBJECTIVE ON/OFF

   In real VR the objective/quest-tracker card is hidden until
   the player toggles it on with B, and stays open until B is
   pressed again (see interaction-prompts.js ->
   syncQuestVisibility / toggleQuestTrackerInVR) -- same on/off
   pattern as vr-menu-button's A-button pause menu above.
============================================================ */

AFRAME.registerComponent(
  'vr-objective-button',
  {
    schema: {
      event: {
        default: 'bbuttondown'
      }
    },

    init: function () {
      this.onButtonDown =
        this.onButtonDown.bind(this);

      this.el.addEventListener(
        this.data.event,
        this.onButtonDown
      );
    },

    onButtonDown: function () {
      /*
        Only in genuine immersive VR -- same guard as
        vr-menu-button, so this never fires on desktop.
      */
      if (
        !hasImmersiveXRSession(
          this.el.sceneEl
        )
      ) {
        return;
      }

      if (
        typeof window.toggleRoomsQuestTracker ===
          'function'
      ) {
        window.toggleRoomsQuestTracker();
      }
    },

    remove: function () {
      this.el.removeEventListener(
        this.data.event,
        this.onButtonDown
      );
    }
  }
);


/* ============================================================
   UI FLOW MANAGER
============================================================ */

AFRAME.registerComponent(
  'ui-flow-manager',
  {
    init: function () {
      this.sync =
        this.sync.bind(this);

      this.updateAudioUI =
        this.updateAudioUI.bind(this);

      this.onEnterVR =
        this.onEnterVR.bind(this);

      this.onExitVR =
        this.onExitVR.bind(this);

      this.onFullscreenChange =
        this.onFullscreenChange
          .bind(this);

      this.onKeyDown =
        this.onKeyDown.bind(this);

      this.el.addEventListener(
        'enter-vr',
        this.onEnterVR
      );

      this.el.addEventListener(
        'exit-vr',
        this.onExitVR
      );

      this.el.addEventListener(
        'audio-settings-changed',
        this.updateAudioUI
      );

      document.addEventListener(
        'fullscreenchange',
        this.onFullscreenChange
      );

      document.addEventListener(
        'webkitfullscreenchange',
        this.onFullscreenChange
      );

      document.addEventListener(
        'keydown',
        this.onKeyDown
      );

      this.sync();
      this.updateAudioUI();
    },

    onEnterVR: function () {
      /*
        On Quest, A-Frame may emit enter-vr slightly before
        renderer.xr.isPresenting becomes true.

        Hide everything first, then re-check after the XR session
        settles. Desktop fullscreen will resolve to the HTML UI.
      */
      hideAllPauseUI();

      window.requestAnimationFrame(
        this.sync
      );

      window.setTimeout(
        this.sync,
        50
      );

      window.setTimeout(
        this.sync,
        250
      );

      window.setTimeout(
        this.sync,
        600
      );
    },

    onExitVR: function () {
      if (roomsPaused) {
        setRoomsPaused(false);
      }

      hideAllPauseUI();
      this.sync();

      window.setTimeout(
        this.sync,
        100
      );
    },

    onFullscreenChange: function () {
      /*
        If fullscreen closes while paused, resume the game so the
        normal browser page cannot be left invisibly locked.
      */
      const mode =
        getPauseUIMode(this.el);

      if (
        mode === 'normal-desktop' &&
        roomsPaused
      ) {
        setRoomsPaused(false);
      }

      this.sync();
    },

    onKeyDown: function (event) {
      if (
        hasImmersiveXRSession(
          this.el
        )
      ) {
        return;
      }

      const desktopPauseMode =
        shouldUseDesktopPauseUI(
          this.el
        );

      if (!desktopPauseMode) {
        return;
      }

      const key = String(
        event.key || ''
      ).toLowerCase();

      /*
        P is the reliable desktop fallback.
        Escape is also supported where the browser allows it.
      */
      if (
        key === 'p' ||
        event.key === 'Escape'
      ) {
        event.preventDefault();
        toggleRoomsPauseMenu();
        return;
      }

      /*
        B is the desktop equivalent of the VR controller B
        button -- toggles the objective card on/off (see
        interaction-prompts.js -> toggleQuestTracker()).
      */
      if (
        key === 'b' &&
        typeof window.toggleRoomsQuestTracker ===
          'function'
      ) {
        event.preventDefault();
        window.toggleRoomsQuestTracker();
      }
    },

    sync: function () {
      syncPauseUI();

      const mode =
        getPauseUIMode(this.el);

      const canvas =
        this.el.renderer
          ? this.el.renderer.domElement
          : null;

      if (canvas) {
        if (
          mode ===
          'desktop-fullscreen'
        ) {
          canvas.style.cursor =
            roomsPaused
              ? 'default'
              : '';
        } else {
          canvas.style.cursor = '';
        }
      }

      console.log(
        'Pause UI mode:',
        {
          mode,
          immersiveXR:
            hasImmersiveXRSession(
              this.el
            ),
          desktopAFrameVR:
            isDesktopAFrameVR(
              this.el
            ),
          browserFullscreen:
            isBrowserFullscreen(),
          paused: roomsPaused
        }
      );
    },

    updateAudioUI: function () {
      updatePauseSoundLabels();
    },

    remove: function () {
      this.el.removeEventListener(
        'enter-vr',
        this.onEnterVR
      );

      this.el.removeEventListener(
        'exit-vr',
        this.onExitVR
      );

      this.el.removeEventListener(
        'audio-settings-changed',
        this.updateAudioUI
      );

      document.removeEventListener(
        'fullscreenchange',
        this.onFullscreenChange
      );

      document.removeEventListener(
        'webkitfullscreenchange',
        this.onFullscreenChange
      );

      document.removeEventListener(
        'keydown',
        this.onKeyDown
      );
    }
  }
);


/* ============================================================
   TUTORIAL
============================================================ */

AFRAME.registerComponent(
  'tutorial-dismiss-on-first-clue',
  {
    init: function () {
      const manager =
        document.querySelector(
          '#story-manager'
        );

      if (!manager) {
        return;
      }

      manager.addEventListener(
        'clue-collected',
        () => {
          this.el.setAttribute(
            'visible',
            false
          );
        },
        {
          once: true
        }
      );
    }
  }
);


/* ============================================================
   INTRO
============================================================ */

AFRAME.registerComponent(
  'intro-sequence',
  {
    schema: {
      voiceSrc: {
        type: 'selector'
      }
    },

    play: function () {
      console.log(
        'Intro sequence hook ready.'
      );
    }
  }
);


/* ============================================================
   PAUSE-AWARE JUMPSCARE
============================================================ */

AFRAME.registerComponent(
  'jumpscare-controller',
  {
    init: function () {
      const manager =
        document.querySelector(
          '#story-manager'
        );

      if (!manager) {
        return;
      }

      this.hasTriggered = false;

      manager.addEventListener(
        'all-clues-collected',
        () => this.trigger(),
        {
          once: true
        }
      );
    },

    trigger: async function () {
      if (this.hasTriggered) {
        return;
      }

      this.hasTriggered = true;

      /*
        If story completion happens while paused, the scare sequence
        does not advance until gameplay is resumed.
      */
      await waitRoomsMilliseconds(1);

      const scareSteps =
        document.querySelector(
          '#scareFootstepAudio'
        );

      if (scareSteps) {
        const audioState =
          window.getRoomsAudioState
            ? window
                .getRoomsAudioState()
            : {
                muted: false,
                volume: 1
              };

        scareSteps.volume =
          audioState.muted
            ? 0
            : 0.35 *
              (
                audioState.volume !==
                undefined
                  ? audioState.volume
                  : 1
              );

        scareSteps.currentTime = 0;

        scareSteps
          .play()
          .catch((error) => {
            console.error(
              'Scare footstep sound failed:',
              error
            );
          });
      }

      await waitRoomsMilliseconds(
        500
      );

      const character =
        document.querySelector(
          '#scare-character'
        );

      if (character) {
        character.setAttribute(
          'visible',
          true
        );
      }

      await waitRoomsMilliseconds(
        1800
      );

      if (character) {
        character.setAttribute(
          'visible',
          false
        );
      }

      if (scareSteps) {
        scareSteps.pause();
        scareSteps.currentTime = 0;
      }
    }
  }
);