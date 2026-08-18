/* ============================================================
   ui-scare.js
   Pause menu + fullscreen/VR UI + tutorial hooks + jumpscare
============================================================ */

let roomsPaused = false;

function isImmersiveXR(scene) {
  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}

function isBrowserFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement
  );
}

function pauseGameplayAudio() {
  document.querySelectorAll('.spatial-sound').forEach((entity) => {
    entity.setAttribute('sound', 'volume', 0);
  });

  const footsteps = document.querySelector('#footstepAudio');
  if (footsteps) {
    footsteps.pause();
    footsteps.currentTime = 0;
  }

  const scareSteps = document.querySelector('#scareFootstepAudio');
  if (scareSteps) {
    scareSteps.pause();
    scareSteps.currentTime = 0;
  }
}

function resumeGameplayAudio() {
  if (window.applyRoomsAudioSettings) {
    window.applyRoomsAudioSettings();
  }
}

function updatePauseSoundLabels() {
  const state = window.getRoomsAudioState
    ? window.getRoomsAudioState()
    : { muted: false };

  const soundText = state.muted
    ? 'SOUND: OFF'
    : 'SOUND: ON';

  const screenSoundButton =
    document.querySelector('#screenSoundButton');

  if (screenSoundButton) {
    screenSoundButton.textContent = soundText;
  }

  const vrSoundLabel =
    document.querySelector('#vrSoundLabel');

  if (vrSoundLabel) {
    vrSoundLabel.setAttribute('value', soundText);
  }
}

function setRoomsPaused(paused) {
  roomsPaused = paused;

  const scene = document.querySelector('a-scene');
  const rig = document.querySelector('#rig');
  const cam = document.querySelector('#cam');
  const leftHand = document.querySelector('#leftHand');
  const cursor = cam
    ? cam.querySelector('a-cursor')
    : null;

  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      !paused
    );
  }

  if (cam) {
    cam.setAttribute(
      'look-controls',
      'enabled',
      !paused
    );
  }

  if (leftHand) {
    leftHand.setAttribute(
      'blink-controls',
      'enabled',
      !paused
    );
  }

  if (cursor) {
    cursor.setAttribute(
      'raycaster',
      'enabled',
      !paused
    );
  }

  const headBob =
    cam && cam.components['head-bob'];

  if (headBob) {
    if (paused && headBob.pause) {
      headBob.pause();
    } else if (!paused && headBob.play) {
      headBob.play();
    }
  }

  const collider =
    rig && rig.components['quest-room-collider'];

  if (collider) {
    if (paused && collider.pause) {
      collider.pause();
    } else if (!paused && collider.play) {
      collider.play();
    }
  }

  const footsteps =
    rig && rig.components['footstep-player'];

  if (footsteps) {
    if (paused && footsteps.pause) {
      footsteps.pause();
    } else if (!paused && footsteps.play) {
      footsteps.play();
    }
  }

  if (paused) {
    pauseGameplayAudio();
  } else {
    resumeGameplayAudio();
  }

  if (scene) {
    scene.emit(
      'rooms-pause-changed',
      { paused: paused },
      false
    );
  }
}

function toggleRoomsPauseMenu(forceOpen) {
  const scene = document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  const immersive = isImmersiveXR(scene);

  const screenOverlay =
    document.querySelector('#screenPauseMenuOverlay');

  const vrPanel =
    document.querySelector('#vrPausePanel');

  const shouldOpen =
    typeof forceOpen === 'boolean'
      ? forceOpen
      : !roomsPaused;

  if (immersive) {
    if (vrPanel) {
      vrPanel.setAttribute('visible', shouldOpen);
    }
  } else {
    if (screenOverlay) {
      screenOverlay.classList.toggle(
        'is-open',
        shouldOpen
      );
    }
  }

  setRoomsPaused(shouldOpen);
}

async function exitRoomsWithin() {
  toggleRoomsPauseMenu(false);

  const scene = document.querySelector('a-scene');

  try {
    if (
      scene &&
      (
        isImmersiveXR(scene) ||
        scene.is('vr-mode')
      )
    ) {
      const result = scene.exitVR();

      if (
        result &&
        typeof result.then === 'function'
      ) {
        await result;
      }
    }
  } catch (error) {
    console.error(
      'Could not exit A-Frame VR mode:',
      error
    );
  }

  try {
    if (document.fullscreenElement) {
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
}

function restartRoomsWithin() {
  window.location.reload();
}

window.toggleRoomsPauseMenu = toggleRoomsPauseMenu;
window.exitRoomsWithin = exitRoomsWithin;
window.restartRoomsWithin = restartRoomsWithin;


/* ============================================================
   Controls when the pause button should appear
============================================================ */

AFRAME.registerComponent('ui-flow-manager', {
  init: function () {
    this.hasEnteredVR = false;
    this.sync = this.sync.bind(this);
    this.updateAudioUI = this.updateAudioUI.bind(this);

    this.el.addEventListener('enter-vr', () => {
      this.hasEnteredVR = true;
      this.sync();
      window.setTimeout(this.sync, 250);
    });

    this.el.addEventListener('exit-vr', () => {
      this.hasEnteredVR = false;
      toggleRoomsPauseMenu(false);
      this.sync();
    });

    this.el.addEventListener(
      'audio-settings-changed',
      this.updateAudioUI
    );

    document.addEventListener(
      'fullscreenchange',
      this.sync
    );

    document.addEventListener(
      'webkitfullscreenchange',
      this.sync
    );

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && roomsPaused) {
        toggleRoomsPauseMenu(false);
      }
    });

    this.sync();
    this.updateAudioUI();
  },

  sync: function () {
    const immersive = isImmersiveXR(this.el);

    const showDesktopPauseButton =
      (this.hasEnteredVR || isBrowserFullscreen()) &&
      !immersive;

    const screenPauseButton =
      document.querySelector('#screenPauseButton');

    if (screenPauseButton) {
      screenPauseButton.classList.toggle(
        'is-visible',
        showDesktopPauseButton
      );
    }

    if (!showDesktopPauseButton) {
      const overlay =
        document.querySelector('#screenPauseMenuOverlay');

      if (overlay) {
        overlay.classList.remove('is-open');
      }
    }

    const vrPauseButton =
      document.querySelector('#vrPauseButton');

    const vrPausePanel =
      document.querySelector('#vrPausePanel');

    if (vrPauseButton) {
      vrPauseButton.setAttribute(
        'visible',
        immersive
      );
    }

    if (vrPausePanel && !immersive) {
      vrPausePanel.setAttribute(
        'visible',
        false
      );
    }
  },

  updateAudioUI: function () {
    updatePauseSoundLabels();
  }
});


/* ============================================================
   Keeps Quest button at a screen corner
============================================================ */

AFRAME.registerComponent('camera-corner-ui', {
  schema: {
    side: {
      default: 'right',
      oneOf: ['left', 'right']
    },
    verticalAnchor: {
      default: 'top',
      oneOf: ['top', 'bottom']
    },
    distance: { default: 2 },
    horizontalInset: { default: 0.13 },
    verticalInset: { default: 0.16 }
  },

  init: function () {
    this.lastUpdate = 0;
  },

  tick: function (time) {
    if (time - this.lastUpdate < 150) {
      return;
    }

    this.lastUpdate = time;

    const cameraEl = document.querySelector('#cam');
    const camera =
      cameraEl && cameraEl.getObject3D('camera');

    if (!camera) {
      return;
    }

    const distance = this.data.distance;

    const fov = THREE.MathUtils.degToRad(
      camera.fov || 60
    );

    const halfHeight =
      Math.tan(fov / 2) * distance;

    const aspect =
      camera.aspect ||
      (window.innerWidth / Math.max(window.innerHeight, 1));

    const halfWidth = halfHeight * aspect;

    const xMagnitude =
      halfWidth *
      (1 - this.data.horizontalInset);

    const yMagnitude =
      halfHeight *
      (1 - this.data.verticalInset);

    const x =
      this.data.side === 'left'
        ? -xMagnitude
        : xMagnitude;

    const y =
      this.data.verticalAnchor === 'bottom'
        ? -yMagnitude
        : yMagnitude;

    this.el.object3D.position.set(
      x,
      y,
      -distance
    );
  }
});


/* ============================================================
   VR controller interaction for pause menu
============================================================ */

AFRAME.registerComponent('vr-ui-interactor', {
  init: function () {
    this.triggerHeld = false;
    this.onTriggerDown = this.onTriggerDown.bind(this);
    this.onTriggerUp = this.onTriggerUp.bind(this);

    this.el.addEventListener(
      'triggerdown',
      this.onTriggerDown
    );

    this.el.addEventListener(
      'triggerup',
      this.onTriggerUp
    );

    this.el.addEventListener(
      'controllerdisconnected',
      this.onTriggerUp
    );
  },

  onTriggerDown: function () {
    if (this.triggerHeld) {
      return;
    }

    this.triggerHeld = true;

    const raycaster = this.el.components.raycaster;

    if (!raycaster) {
      return;
    }

    if (raycaster.refreshObjects) {
      raycaster.refreshObjects();
    }

    const hit = (element) =>
      element && raycaster.getIntersection
        ? raycaster.getIntersection(element)
        : null;

    const vrPauseButton =
      document.querySelector('#vrPauseButton');

    const vrPausePanel =
      document.querySelector('#vrPausePanel');

    const vrResumeButton =
      document.querySelector('#vrResumeButton');

    const vrSoundButton =
      document.querySelector('#vrSoundButton');

    const vrRestartButton =
      document.querySelector('#vrRestartButton');

    const vrExitButton =
      document.querySelector('#vrExitButton');

    if (hit(vrPauseButton)) {
      toggleRoomsPauseMenu();
      return;
    }

    if (
      vrPausePanel &&
      vrPausePanel.getAttribute('visible')
    ) {
      if (hit(vrResumeButton)) {
        toggleRoomsPauseMenu(false);
        return;
      }

      if (hit(vrSoundButton)) {
        if (window.toggleRoomsMute) {
          window.toggleRoomsMute();
        }
        return;
      }

      if (hit(vrRestartButton)) {
        restartRoomsWithin();
        return;
      }

      if (hit(vrExitButton)) {
        exitRoomsWithin();
        return;
      }
    }
  },

  onTriggerUp: function () {
    this.triggerHeld = false;
  }
});


/* ============================================================
   Tutorial hook
============================================================ */

AFRAME.registerComponent(
  'tutorial-dismiss-on-first-clue',
  {
    init: function () {
      const manager =
        document.querySelector('#story-manager');

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
        { once: true }
      );
    }
  }
);


/* ============================================================
   Intro hook
============================================================ */

AFRAME.registerComponent('intro-sequence', {
  schema: {
    voiceSrc: { type: 'selector' }
  },

  play: function () {
    console.log(
      'Intro sequence hook ready. Add final voice/fader assets before enabling it.'
    );
  }
});


/* ============================================================
   Jumpscare
============================================================ */

AFRAME.registerComponent('jumpscare-controller', {
  init: function () {
    const manager =
      document.querySelector('#story-manager');

    if (!manager) {
      return;
    }

    manager.addEventListener(
      'all-clues-collected',
      () => this.trigger(),
      { once: true }
    );
  },

  trigger: function () {
    const scareSteps =
      document.querySelector('#scareFootstepAudio');

    if (scareSteps) {
      const audioState =
        window.getRoomsAudioState
          ? window.getRoomsAudioState()
          : { muted: false, volume: 1 };

      scareSteps.volume =
        audioState.muted
          ? 0
          : 0.35 * audioState.volume;

      scareSteps.currentTime = 0;

      scareSteps.play().catch((error) => {
        console.error(
          'Scare footstep sound failed:',
          error
        );
      });
    }

    setTimeout(() => {
      const character =
        document.querySelector('#scare-character');

      if (character) {
        character.setAttribute(
          'visible',
          true
        );
      }

      setTimeout(() => {
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
      }, 1800);
    }, 500);
  }
});