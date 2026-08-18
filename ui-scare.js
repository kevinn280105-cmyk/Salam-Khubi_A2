/* ============================================================
   ui-scare.js
   ROOMS WITHIN

   Handles:
   - Mac fullscreen pause button
   - Quest VR pause button
   - Pause / resume
   - Sound toggle label updates
   - Restart game
   - Exit VR / fullscreen
   - VR pause-menu ray interaction
   - Tutorial hook
   - Jumpscare hook
============================================================ */

let roomsPaused = false;


/* ============================================================
   MODE HELPERS
============================================================ */

function hasImmersiveXRSession(scene) {
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


function isDesktopAFrameVR(scene) {
  return Boolean(
    scene &&
    scene.is &&
    scene.is('vr-mode') &&
    !hasImmersiveXRSession(scene)
  );
}


/* ============================================================
   SOUND LABELS
============================================================ */

function updatePauseSoundLabels() {
  let muted = false;

  if (window.getRoomsAudioState) {
    const state = window.getRoomsAudioState();
    muted = Boolean(state && state.muted);
  } else if (typeof window.roomsMuted === 'boolean') {
    muted = window.roomsMuted;
  }

  const text = muted
    ? 'SOUND: OFF'
    : 'SOUND: ON';

  const screenButton =
    document.querySelector('#screenSoundButton');

  if (screenButton) {
    screenButton.textContent = text;
  }

  const vrLabel =
    document.querySelector('#vrSoundLabel');

  if (vrLabel) {
    vrLabel.setAttribute('value', text);
  }
}


/* ============================================================
   PAUSE AUDIO
============================================================ */

function pauseRoomsAudio() {
  document
    .querySelectorAll('.spatial-sound')
    .forEach((entity) => {
      const sound = entity.components.sound;

      if (sound && sound.pauseSound) {
        sound.pauseSound();
      }
    });

  const footstep =
    document.querySelector('#footstepAudio');

  if (footstep) {
    footstep.pause();
  }

  const scareFootstep =
    document.querySelector('#scareFootstepAudio');

  if (scareFootstep) {
    scareFootstep.pause();
  }
}


function resumeRoomsAudio() {
  if (window.applyRoomsAudioSettings) {
    window.applyRoomsAudioSettings();
  }
}


/* ============================================================
   PAUSE / RESUME GAMEPLAY
============================================================ */

function setRoomsPaused(paused) {
  roomsPaused = Boolean(paused);

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


  /* PLAYER MOVEMENT */

  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      !roomsPaused
    );
  }


  /* MAC MOUSE LOOK */

  if (
    cam &&
    !hasImmersiveXRSession(scene)
  ) {
    cam.setAttribute(
      'look-controls',
      'enabled',
      !roomsPaused
    );
  }


  /* QUEST TELEPORT */

  if (leftHand) {
    leftHand.setAttribute(
      'blink-controls',
      'enabled',
      !roomsPaused
    );
  }


  /* DESKTOP WORLD CLICKING */

  if (cursor) {
    cursor.setAttribute(
      'raycaster',
      'enabled',
      !roomsPaused
    );
  }


  /* QUEST DOOR / TV */

  if (rightHand) {
    if (rightHand.hasAttribute('vr-door-interactor')) {
      rightHand.setAttribute(
        'vr-door-interactor',
        'enabled',
        !roomsPaused
      );
    }

    if (rightHand.hasAttribute('vr-tv-interactor')) {
      rightHand.setAttribute(
        'vr-tv-interactor',
        'enabled',
        !roomsPaused
      );
    }
  }


  /* COMPONENT PAUSE */

  const pausableComponents = [];

  if (rig) {
    pausableComponents.push(
      rig.components['quest-room-collider'],
      rig.components['footstep-player']
    );
  }

  if (cam) {
    pausableComponents.push(
      cam.components['head-bob']
    );
  }

  pausableComponents.forEach((component) => {
    if (!component) {
      return;
    }

    if (
      roomsPaused &&
      component.pause
    ) {
      component.pause();
    } else if (
      !roomsPaused &&
      component.play
    ) {
      component.play();
    }
  });


  /* AUDIO */

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
   OPEN / CLOSE PAUSE MENU
============================================================ */

function toggleRoomsPauseMenu(forceOpen) {
  const scene =
    document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  const immersive =
    hasImmersiveXRSession(scene);

  const screenOverlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  const vrPanel =
    document.querySelector(
      '#vrPausePanel'
    );

  const shouldOpen =
    typeof forceOpen === 'boolean'
      ? forceOpen
      : !roomsPaused;


  if (immersive) {
    if (vrPanel) {
      vrPanel.setAttribute(
        'visible',
        shouldOpen
      );
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

  updatePauseSoundLabels();
}


/* ============================================================
   RESTART
============================================================ */

function restartRoomsWithin() {
  window.location.reload();
}


/* ============================================================
   EXIT VR / FULLSCREEN
============================================================ */

async function exitRoomsWithin() {
  if (roomsPaused) {
    toggleRoomsPauseMenu(false);
  }

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
        typeof result.then === 'function'
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


/* ============================================================
   EXPOSE BUTTON FUNCTIONS
============================================================ */

window.toggleRoomsPauseMenu =
  toggleRoomsPauseMenu;

window.restartRoomsWithin =
  restartRoomsWithin;

window.exitRoomsWithin =
  exitRoomsWithin;

window.updatePauseSoundLabels =
  updatePauseSoundLabels;


/* ============================================================
   UI FLOW MANAGER

   IMPORTANT FIX:

   The old code looked for:
     #screenSettingsButton
     #screenExitButton

   The new index.html uses:
     #screenPauseButton
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
      /*
        A-Frame can fire enter-vr before fullscreen state
        completely settles, so check several times.
      */

      this.sync();

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
        toggleRoomsPauseMenu(false);
      }

      this.sync();

      window.setTimeout(
        this.sync,
        100
      );
    },


    onFullscreenChange: function () {
      this.sync();
    },


    onKeyDown: function (event) {
      if (
        event.key === 'Escape' &&
        roomsPaused
      ) {
        toggleRoomsPauseMenu(false);
      }
    },


    sync: function () {
      const immersive =
        hasImmersiveXRSession(this.el);

      const desktopVR =
        isDesktopAFrameVR(this.el);

      const fullscreen =
        isBrowserFullscreen();


      /* MAC / DESKTOP BUTTON */

      const showDesktopPauseButton =
        !immersive &&
        (
          desktopVR ||
          fullscreen
        );


      const screenPauseButton =
        document.querySelector(
          '#screenPauseButton'
        );

      if (screenPauseButton) {
        screenPauseButton.classList.toggle(
          'is-visible',
          showDesktopPauseButton
        );
      }


      /* DESKTOP MENU */

      const desktopOverlay =
        document.querySelector(
          '#screenPauseMenuOverlay'
        );

      if (
        desktopOverlay &&
        !showDesktopPauseButton
      ) {
        desktopOverlay.classList.remove(
          'is-open'
        );
      }


      /* REAL QUEST VR BUTTON */

      const vrPauseButton =
        document.querySelector(
          '#vrPauseButton'
        );

      const vrPausePanel =
        document.querySelector(
          '#vrPausePanel'
        );

      if (vrPauseButton) {
        vrPauseButton.setAttribute(
          'visible',
          immersive
        );
      }

      if (
        vrPausePanel &&
        !immersive
      ) {
        vrPausePanel.setAttribute(
          'visible',
          false
        );
      }


      console.log(
        'Pause UI mode:',
        {
          immersiveXR: immersive,
          desktopAFrameVR: desktopVR,
          browserFullscreen: fullscreen,
          showDesktopButton:
            showDesktopPauseButton
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
   CAMERA-CORNER VR UI
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
        time - this.lastUpdate < 150
      ) {
        return;
      }

      this.lastUpdate = time;

      const cameraEl =
        document.querySelector('#cam');

      const camera =
        cameraEl
          ? cameraEl.getObject3D('camera')
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
        this.data.verticalAnchor === 'bottom'
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
   QUEST PAUSE MENU INTERACTION
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
          !element ||
          !raycaster.getIntersection
        ) {
          return null;
        }

        return raycaster.getIntersection(
          element
        );
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
        !pausePanel.getAttribute('visible')
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
   TUTORIAL HOOK
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
   INTRO HOOK
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
   JUMPSCARE
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

      manager.addEventListener(
        'all-clues-collected',
        () => this.trigger(),
        {
          once: true
        }
      );
    },


    trigger: function () {
      const scareSteps =
        document.querySelector(
          '#scareFootstepAudio'
        );

      if (scareSteps) {
        const audioState =
          window.getRoomsAudioState
            ? window.getRoomsAudioState()
            : {
                muted: false,
                volume: 1
              };

        scareSteps.volume =
          audioState.muted
            ? 0
            : 0.35 *
              (
                audioState.volume !== undefined
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


      window.setTimeout(
        () => {
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


          window.setTimeout(
            () => {
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
            },
            1800
          );
        },
        500
      );
    }
  }
);