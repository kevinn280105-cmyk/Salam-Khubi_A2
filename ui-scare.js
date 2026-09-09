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
   PAUSE-AWARE TIMER
============================================================ */

function waitRoomsMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    let remaining = Math.max(
      0,
      Number(milliseconds) || 0
    );

    let previous =
      performance.now();

    function step(now) {
      const elapsed = Math.max(
        0,
        now - previous
      );

      previous = now;

      if (
        !window.roomsPaused &&
        !window.roomsInputLocked
      ) {
        remaining -= elapsed;
      }

      if (remaining <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(
        step
      );
    }

    window.requestAnimationFrame(
      step
    );
  });
}

window.waitRoomsMilliseconds =
  waitRoomsMilliseconds;


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
  if (roomsMainMenuStarted) {
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