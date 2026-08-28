/* ============================================================
   ui-scare.js — ROOMS WITHIN
   FULL REPLACEMENT

   QUEST:
   - Settings gear + panel stay attached to #cam.
   - Right-controller B opens/closes Settings.
   - Right trigger selects the 3D Settings controls.
   - Right-controller ray points straight forward.
   - Virtual hand mesh is corrected upward by 40 degrees without
     changing the real controller tracking/grab position.

   DESKTOP:
   - HTML Settings UI appears in fullscreen.
============================================================ */

let roomsPaused = false;

window.roomsPaused = false;
window.roomsInputLocked = false;


/* ============================================================
   MODE DETECTION
============================================================ */

function hasImmersiveXRSession(scene) {
  try {
    if (!scene || !scene.renderer || !scene.renderer.xr) return false;

    const xr = scene.renderer.xr;

    return Boolean(
      xr.isPresenting ||
      (xr.getSession && xr.getSession())
    );
  } catch (error) {
    console.warn('Could not read XR session state:', error);
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


function getPauseUIMode(scene) {
  if (hasImmersiveXRSession(scene)) {
    return 'immersive-vr';
  }

  if (
    scene &&
    (
      isDesktopAFrameVR(scene) ||
      isBrowserFullscreen()
    )
  ) {
    return 'desktop-fullscreen';
  }

  return 'normal-desktop';
}


function isEntityVisible(entity) {
  if (!entity) return false;

  const value = entity.getAttribute('visible');

  return value === true || value === 'true';
}


/* ============================================================
   PAUSE-AWARE TIMER
============================================================ */

function waitRoomsMilliseconds(milliseconds) {
  return new Promise((resolve) => {
    let remaining = Math.max(0, Number(milliseconds) || 0);
    let previous = performance.now();

    function step(now) {
      const elapsed = Math.max(0, now - previous);
      previous = now;

      if (!window.roomsPaused && !window.roomsInputLocked) {
        remaining -= elapsed;
      }

      if (remaining <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  });
}

window.waitRoomsMilliseconds = waitRoomsMilliseconds;


/* ============================================================
   SOUND LABEL
============================================================ */

function updatePauseSoundLabels() {
  let muted = false;

  if (window.getRoomsAudioState) {
    const state = window.getRoomsAudioState();
    muted = Boolean(state && state.muted);
  } else if (typeof window.roomsMuted === 'boolean') {
    muted = window.roomsMuted;
  }

  const text = muted ? 'SOUND: OFF' : 'SOUND: ON';

  const screenButton =
    document.querySelector('#screenSoundButton');

  const vrLabel =
    document.querySelector('#vrSoundLabel');

  if (screenButton) {
    screenButton.textContent = text;
  }

  if (vrLabel) {
    vrLabel.setAttribute('value', text);
  }
}


/* ============================================================
   AUDIO PAUSE / RESUME
============================================================ */

function pauseRoomsAudio() {
  const scene = document.querySelector('a-scene');

  const manager =
    scene &&
    scene.components
      ? scene.components['spatial-audio-manager']
      : null;

  if (manager && typeof manager.pauseAll === 'function') {
    manager.pauseAll();
  } else {
    document
      .querySelectorAll('.spatial-sound')
      .forEach((entity) => {
        const sound =
          entity.components &&
          entity.components.sound;

        if (sound && sound.pauseSound) {
          try {
            sound.pauseSound();
          } catch (error) {
            /* compatibility fallback only */
          }
        }
      });
  }

  const footstep =
    document.querySelector('#footstepAudio');

  const scareFootstep =
    document.querySelector('#scareFootstepAudio');

  if (footstep) footstep.pause();
  if (scareFootstep) scareFootstep.pause();
}


function resumeRoomsAudio() {
  if (window.applyRoomsAudioSettings) {
    window.applyRoomsAudioSettings();
  }
}


/* ============================================================
   RAYCASTER PAUSE FILTER
============================================================ */

function saveRaycasterObjects(entity) {
  if (
    !entity ||
    entity.__roomsSavedRayObjects !== undefined
  ) {
    return;
  }

  const data =
    entity.getAttribute('raycaster') || {};

  entity.__roomsSavedRayObjects =
    String(data.objects || '');
}


function setRaycasterForPause(entity, paused) {
  if (!entity) return;

  saveRaycasterObjects(entity);

  entity.setAttribute(
    'raycaster',
    'objects',
    paused
      ? '.vr-control'
      : (entity.__roomsSavedRayObjects || '')
  );

  const raycaster =
    entity.components &&
    entity.components.raycaster;

  if (raycaster && raycaster.refreshObjects) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   WORLD PAUSE HELPERS
============================================================ */

function setComponentPaused(component, paused) {
  if (!component) return;

  if (paused && typeof component.pause === 'function') {
    component.pause();
    return;
  }

  if (!paused && typeof component.play === 'function') {
    component.play();
  }
}


function pauseEntityComponent(entity, name, paused) {
  if (!entity || !entity.components) return;

  setComponentPaused(
    entity.components[name],
    paused
  );
}


function pauseWorldComponents(paused) {
  const rig =
    document.querySelector('#rig');

  const cam =
    document.querySelector('#cam');

  const door =
    document.querySelector('#door');

  const tv =
    document.querySelector('#tv');

  const incense =
    document.querySelector('#incenseStick');

  const incenseTip =
    document.querySelector('#incenseTip');

  const altar =
    document.querySelector('#bantho');

  const offeringManager =
    document.querySelector('#offeringManager');

  const mirror =
    document.querySelector('#mirror');

  pauseEntityComponent(
    rig,
    'quest-room-collider',
    paused
  );

  pauseEntityComponent(
    rig,
    'footstep-player',
    paused
  );

  pauseEntityComponent(
    cam,
    'head-bob',
    paused
  );

  pauseEntityComponent(
    door,
    'door-hinge',
    paused
  );

  pauseEntityComponent(
    door,
    'auto-door-proximity',
    paused
  );

  pauseEntityComponent(
    tv,
    'embedded-tv',
    paused
  );

  pauseEntityComponent(
    incense,
    'incense-offering',
    paused
  );

  pauseEntityComponent(
    incenseTip,
    'incense-smoke',
    paused
  );

  pauseEntityComponent(
    incenseTip,
    'realistic-incense-smoke',
    paused
  );

  pauseEntityComponent(
    altar,
    'temporary-offering-table-smoke',
    paused
  );

  pauseEntityComponent(
    offeringManager,
    'offering-layout',
    paused
  );

  pauseEntityComponent(
    offeringManager,
    'offering-blackout',
    paused
  );

  pauseEntityComponent(
    mirror,
    'haunted-mirror',
    paused
  );

  document
    .querySelectorAll('[flicker]')
    .forEach((entity) => {
      pauseEntityComponent(
        entity,
        'flicker',
        paused
      );
    });

  document
    .querySelectorAll('[proximity-light-reaction]')
    .forEach((entity) => {
      pauseEntityComponent(
        entity,
        'proximity-light-reaction',
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
  window.roomsInputLocked = roomsPaused;

  const scene =
    document.querySelector('a-scene');

  const rig =
    document.querySelector('#rig');

  const cam =
    document.querySelector('#cam');

  const leftHand =
    document.querySelector('#leftHand');

  const rightHand =
    document.querySelector('#rightHand');

  const cursor =
    cam
      ? cam.querySelector('a-cursor')
      : null;

  const immersiveXR =
    hasImmersiveXRSession(scene);

  /*
    Quest stays teleport-only.
    Desktop gets normal movement when unpaused.
  */
  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      roomsPaused
        ? false
        : !immersiveXR
    );
  }

  /*
    Never disable real headset tracking.
    Only freeze desktop mouse look.
  */
  if (cam && !immersiveXR) {
    cam.setAttribute(
      'look-controls',
      'enabled',
      !roomsPaused
    );
  }

  if (leftHand) {
    leftHand.setAttribute(
      'blink-controls',
      'enabled',
      !roomsPaused
    );
  }

  setRaycasterForPause(
    cursor,
    roomsPaused
  );

  setRaycasterForPause(
    rightHand,
    roomsPaused
  );

  pauseWorldComponents(
    roomsPaused
  );

  if (roomsPaused) {
    pauseRoomsAudio();
  } else {
    resumeRoomsAudio();
  }

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
   UI VISIBILITY
============================================================ */

function set3DPauseButtonVisible(visible) {
  const button =
    document.querySelector('#vrPauseButton');

  if (button) {
    button.setAttribute(
      'visible',
      Boolean(visible)
    );
  }
}


function set3DPausePanelVisible(visible) {
  const panel =
    document.querySelector('#vrPausePanel');

  if (panel) {
    panel.setAttribute(
      'visible',
      Boolean(visible)
    );
  }
}


function setDesktopPauseButtonVisible(visible) {
  const button =
    document.querySelector('#screenPauseButton');

  if (!button) return;

  button.classList.toggle(
    'is-visible',
    Boolean(visible)
  );
}


function setDesktopPauseOverlayVisible(visible) {
  const overlay =
    document.querySelector('#screenPauseMenuOverlay');

  if (!overlay) return;

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

  if (mode === 'desktop-fullscreen') {
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

  hideAllPauseUI();
}


/* ============================================================
   OPEN / CLOSE SETTINGS
============================================================ */

function toggleRoomsPauseMenu(forceOpen) {
  const scene =
    document.querySelector('a-scene');

  if (!scene) return;

  const mode =
    getPauseUIMode(scene);

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
   RESTART / EXIT
============================================================ */

function restartRoomsWithin() {
  window.location.reload();
}


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
      const result =
        scene.exitVR();

      if (
        result &&
        typeof result.then === 'function'
      ) {
        await result;
      }
    } catch (error) {
      console.error(
        'Could not exit A-Frame VR:',
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
      'Could not exit fullscreen:',
      error
    );
  }

  window.setTimeout(
    syncPauseUI,
    50
  );
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.toggleRoomsPauseMenu =
  toggleRoomsPauseMenu;

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
   HAND VISUAL CORRECTION

   Rotate ONLY the visible hand mesh upward by about 40 degrees.
   Do not rotate the tracked controller entity itself.

   That means:
   - grip position stays correct
   - teleport stays correct
   - ray direction stays correct
   - visual hand no longer points ~45 degrees downward
============================================================ */

AFRAME.registerComponent(
  'controller-hand-visual-offset',
  {
    schema: {
      pitch: {
        default: 40
      },

      yaw: {
        default: 0
      },

      roll: {
        default: 0
      }
    },

    init: function () {
      this.mesh = null;
      this.baseQuaternion = null;

      this.apply =
        this.apply.bind(this);

      this.onObject3DSet =
        this.onObject3DSet.bind(this);

      this.el.addEventListener(
        'object3dset',
        this.onObject3DSet
      );

      [0, 120, 400, 1000].forEach(
        (delay) => {
          window.setTimeout(
            this.apply,
            delay
          );
        }
      );
    },

    onObject3DSet: function () {
      window.setTimeout(
        this.apply,
        0
      );
    },

    update: function () {
      /*
        If index.html still contains an older pitch value, A-Frame
        can update this component at runtime and immediately reapply
        the corrected orientation.
      */
      if (this.baseQuaternion) {
        this.apply();
      }
    },

    apply: function () {
      const mesh =
        this.el.getObject3D('mesh');

      if (!mesh) return;

      /*
        Only establish a new base orientation
        when hand-controls creates/replaces its mesh.
      */
      if (mesh !== this.mesh) {
        this.mesh = mesh;

        this.baseQuaternion =
          mesh.quaternion.clone();
      }

      if (!this.baseQuaternion) {
        return;
      }

      const offset =
        new THREE.Quaternion()
          .setFromEuler(
            new THREE.Euler(
              THREE.MathUtils.degToRad(
                this.data.pitch
              ),
              THREE.MathUtils.degToRad(
                this.data.yaw
              ),
              THREE.MathUtils.degToRad(
                this.data.roll
              ),
              'XYZ'
            )
          );

      /*
        Apply the correction in the controller/parent space.

        IMPORTANT:
        The previous version multiplied the offset AFTER the hand
        model's original quaternion. On Quest, that treated the
        correction as a local-model rotation and made the hand swing
        sideways.

        Pre-multiplying the offset makes the pitch correction happen
        relative to the controller/parent orientation instead.
      */
      mesh.quaternion
        .copy(
          offset
        )
        .multiply(
          this.baseQuaternion
        );
    },

    remove: function () {
      this.el.removeEventListener(
        'object3dset',
        this.onObject3DSet
      );

      if (
        this.mesh &&
        this.baseQuaternion
      ) {
        this.mesh.quaternion.copy(
          this.baseQuaternion
        );
      }
    }
  }
);


/* ============================================================
   QUEST CONTROLLER PRESENTATION

   Right ray:
     OLD  0 -0.45 -0.89
     NEW  0  0    -1

   The laser now points straight from the controller.
============================================================ */

function setupRoomsQuestControllerPresentation() {
  const leftHand =
    document.querySelector('#leftHand');

  const rightHand =
    document.querySelector('#rightHand');

  [leftHand, rightHand]
    .forEach((hand) => {
      if (!hand) {
        return;
      }

      /*
        Force the corrected value even if index.html still has the
        older 45-degree hand-offset setting.
      */
      hand.setAttribute(
        'controller-hand-visual-offset',
        'pitch: 40; yaw: 0; roll: 0'
      );
    });

  if (
    rightHand &&
    rightHand.hasAttribute('raycaster')
  ) {
    rightHand.setAttribute(
      'raycaster',
      'direction',
      '0 0 -1'
    );

    const raycaster =
      rightHand.components &&
      rightHand.components.raycaster;

    if (
      raycaster &&
      raycaster.refreshObjects
    ) {
      raycaster.refreshObjects();
    }
  }
}


/* ============================================================
   LEGACY COMPONENTS
============================================================ */

AFRAME.registerComponent(
  'camera-corner-ui',
  {
    init: function () {
      /*
        No longer needed.
        #vrPauseButton and #vrPausePanel are already under #cam.
      */
    }
  }
);


AFRAME.registerComponent(
  'desktop-vr-ui-pointer',
  {
    init: function () {
      /*
        Desktop fullscreen uses HTML Settings UI.
      */
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
   QUEST RIGHT CONTROLLER SETTINGS

   B:
   - gameplay -> open Settings
   - Settings -> close Settings / resume

   Trigger:
   - point at gear / panel control
   - press trigger
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
      this.lastBPress = 0;

      this.pressTrigger =
        this.pressTrigger.bind(this);

      this.releaseTrigger =
        this.releaseTrigger.bind(this);

      this.onTriggerChanged =
        this.onTriggerChanged.bind(this);

      this.onBButton =
        this.onBButton.bind(this);

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
        'bbuttondown',
        this.onBButton
      );

      this.el.addEventListener(
        'controllerdisconnected',
        this.releaseTrigger
      );
    },

    onBButton: function (event) {
      if (
        !hasImmersiveXRSession(
          this.el.sceneEl
        )
      ) {
        return;
      }

      const now =
        performance.now();

      if (
        now - this.lastBPress <
        250
      ) {
        return;
      }

      this.lastBPress = now;

      if (
        event &&
        event.stopPropagation
      ) {
        event.stopPropagation();
      }

      toggleRoomsPauseMenu(
        !roomsPaused
      );
    },

    pressTrigger: function (event) {
      if (this.triggerHeld) return;

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

    onTriggerChanged: function (event) {
      const value =
        event &&
        event.detail &&
        typeof event.detail.value === 'number'
          ? event.detail.value
          : null;

      if (value === null) return;

      if (
        value >= this.data.pressThreshold &&
        !this.triggerHeld
      ) {
        this.pressTrigger();

      } else if (
        value <= this.data.releaseThreshold
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

      if (!raycaster) return;

      if (raycaster.refreshObjects) {
        raycaster.refreshObjects();
      }

      const hit =
        (element) => {
          if (
            !element ||
            !raycaster.getIntersection
          ) {
            return null;
          }

          return raycaster.getIntersection(
            element
          );
        };

      const gear =
        document.querySelector(
          '#vrPauseButton'
        );

      const panel =
        document.querySelector(
          '#vrPausePanel'
        );

      const resume =
        document.querySelector(
          '#vrResumeButton'
        );

      const sound =
        document.querySelector(
          '#vrSoundButton'
        );

      const restart =
        document.querySelector(
          '#vrRestartButton'
        );

      const exit =
        document.querySelector(
          '#vrExitButton'
        );

      /*
        Menu closed:
        only the gear should react.
      */
      if (!roomsPaused) {
        if (hit(gear)) {
          toggleRoomsPauseMenu(true);
        }

        return;
      }

      /*
        Menu open.
      */
      if (
        !panel ||
        !isEntityVisible(panel)
      ) {
        return;
      }

      if (hit(resume)) {
        toggleRoomsPauseMenu(false);
        return;
      }

      if (hit(sound)) {
        if (window.toggleRoomsMute) {
          window.toggleRoomsMute();
        }

        window.setTimeout(
          updatePauseSoundLabels,
          0
        );

        return;
      }

      if (hit(restart)) {
        restartRoomsWithin();
        return;
      }

      if (hit(exit)) {
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
        'bbuttondown',
        this.onBButton
      );

      this.el.removeEventListener(
        'controllerdisconnected',
        this.releaseTrigger
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
        this.onFullscreenChange.bind(this);

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
      hideAllPauseUI();

      [
        0,
        50,
        200,
        500,
        1000
      ].forEach((delay) => {
        window.setTimeout(
          this.sync,
          delay
        );
      });
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

      if (
        getPauseUIMode(
          this.el
        ) !== 'desktop-fullscreen'
      ) {
        return;
      }

      const key =
        String(
          event.key || ''
        ).toLowerCase();

      if (
        key === 'p' ||
        event.key === 'Escape'
      ) {
        event.preventDefault();
        toggleRoomsPauseMenu();
      }
    },

    sync: function () {
      syncPauseUI();

      const canvas =
        this.el.renderer
          ? this.el.renderer.domElement
          : null;

      if (canvas) {
        canvas.style.cursor =
          getPauseUIMode(this.el) ===
            'desktop-fullscreen' &&
          roomsPaused
            ? 'default'
            : '';
      }
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

      if (!manager) return;

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

      if (!manager) return;

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
      if (this.hasTriggered) return;

      this.hasTriggered = true;

      await waitRoomsMilliseconds(1);

      const scareSteps =
        document.querySelector(
          '#scareFootstepAudio'
        );

      if (scareSteps) {
        const state =
          window.getRoomsAudioState
            ? window.getRoomsAudioState()
            : {
                muted: false,
                volume: 1
              };

        scareSteps.volume =
          state.muted
            ? 0
            : 0.35 *
              (
                state.volume !== undefined
                  ? state.volume
                  : 1
              );

        scareSteps.currentTime = 0;

        try {
          const result =
            scareSteps.play();

          if (
            result &&
            result.catch
          ) {
            result.catch(
              () => {}
            );
          }
        } catch (error) {
          /* best effort only */
        }
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


/* ============================================================
   DEBUG
============================================================ */

function getRoomsUIDebug() {
  const scene =
    document.querySelector('a-scene');

  const cam =
    document.querySelector('#cam');

  const gear =
    document.querySelector(
      '#vrPauseButton'
    );

  const panel =
    document.querySelector(
      '#vrPausePanel'
    );

  const rightHand =
    document.querySelector(
      '#rightHand'
    );

  const rightRay =
    rightHand
      ? rightHand.getAttribute(
          'raycaster'
        )
      : null;

  return {
    mode:
      scene
        ? getPauseUIMode(scene)
        : 'no-scene',

    immersiveXR:
      hasImmersiveXRSession(
        scene
      ),

    paused:
      roomsPaused,

    gearVisible:
      isEntityVisible(
        gear
      ),

    gearParentIsCamera:
      Boolean(
        gear &&
        cam &&
        gear.parentElement === cam
      ),

    panelVisible:
      isEntityVisible(
        panel
      ),

    panelParentIsCamera:
      Boolean(
        panel &&
        cam &&
        panel.parentElement === cam
      ),

    rightRayDirection:
      rightRay
        ? rightRay.direction
        : null,

    rightBOpensSettings:
      Boolean(
        rightHand &&
        rightHand.hasAttribute(
          'vr-ui-interactor'
        )
      )
  };
}

window.getRoomsUIDebug =
  getRoomsUIDebug;


/* ============================================================
   STARTUP
============================================================ */

window.addEventListener(
  'DOMContentLoaded',
  () => {
    updatePauseSoundLabels();
    syncPauseUI();

    const scene =
      document.querySelector(
        'a-scene'
      );

    const setup =
      () => {
        setupRoomsQuestControllerPresentation();

        [250, 750, 1500].forEach(
          (delay) => {
            window.setTimeout(
              setupRoomsQuestControllerPresentation,
              delay
            );
          }
        );
      };

    if (
      scene &&
      !scene.hasLoaded
    ) {
      scene.addEventListener(
        'loaded',
        setup,
        {
          once: true
        }
      );
    } else {
      setup();
    }
  }
);