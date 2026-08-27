/* ============================================================
   ui-scare.js — ROOMS WITHIN
   FULL REPLACEMENT — HEADSET-FOLLOWING SETTINGS

   - Desktop fullscreen: HTML settings button + panel.
   - Meta Quest/WebXR: 3D gear + 3D panel.
   - #vrPauseButton and #vrPausePanel live under #cam in index.html,
     so both follow the headset automatically.
   - Right trigger operates the Quest settings UI.
   - SOUND: ON/OFF stays the middle toggle.
   - Pauses teleport, interactions, effects and audio safely.
============================================================ */

let roomsPaused = false;

window.roomsPaused = false;
window.roomsInputLocked = false;


/* ============================================================
   MODE HELPERS
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

    const xr =
      scene.renderer.xr;

    return Boolean(
      xr.isPresenting ||
      (
        xr.getSession &&
        xr.getSession()
      )
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


function getPauseUIMode(scene) {
  if (
    hasImmersiveXRSession(scene)
  ) {
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


function isAFrameVisible(entity) {
  if (!entity) {
    return false;
  }

  const value =
    entity.getAttribute(
      'visible'
    );

  return (
    value === true ||
    value === 'true'
  );
}


/* ============================================================
   PAUSE-AWARE TIMER
============================================================ */

function waitRoomsMilliseconds(
  milliseconds
) {
  return new Promise(
    (resolve) => {
      let remaining =
        Math.max(
          0,
          Number(milliseconds) || 0
        );

      let previous =
        performance.now();


      function step(now) {
        const elapsed =
          Math.max(
            0,
            now - previous
          );

        previous =
          now;


        if (
          !window.roomsPaused &&
          !window.roomsInputLocked
        ) {
          remaining -=
            elapsed;
        }


        if (
          remaining <= 0
        ) {
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
    }
  );
}


window.waitRoomsMilliseconds =
  waitRoomsMilliseconds;


/* ============================================================
   SOUND LABEL
============================================================ */

function updatePauseSoundLabels() {
  let muted =
    false;


  if (
    window.getRoomsAudioState
  ) {
    const state =
      window.getRoomsAudioState();

    muted =
      Boolean(
        state &&
        state.muted
      );

  } else if (
    typeof window.roomsMuted ===
    'boolean'
  ) {
    muted =
      window.roomsMuted;
  }


  const label =
    muted
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


  if (
    screenButton
  ) {
    screenButton.textContent =
      label;
  }


  if (
    vrLabel
  ) {
    vrLabel.setAttribute(
      'value',
      label
    );
  }
}


/* ============================================================
   AUDIO PAUSE / RESUME
============================================================ */

function pauseRoomsAudio() {
  const scene =
    document.querySelector(
      'a-scene'
    );


  const manager =
    scene &&
    scene.components
      ? scene.components[
          'spatial-audio-manager'
        ]
      : null;


  /*
    Use audio.js's own manager.

    This is important because audio.js keeps track of which
    sounds it thinks are currently playing.
  */

  if (
    manager &&
    typeof manager.pauseAll ===
      'function'
  ) {
    manager.pauseAll();

  } else {
    document
      .querySelectorAll(
        '.spatial-sound'
      )
      .forEach(
        (entity) => {
          const sound =
            entity.components &&
            entity.components.sound;


          if (
            sound &&
            sound.pauseSound
          ) {
            try {
              sound.pauseSound();

            } catch (error) {
              /*
                Best effort only.
              */
            }
          }
        }
      );
  }


  const footstep =
    document.querySelector(
      '#footstepAudio'
    );


  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );


  if (
    footstep
  ) {
    footstep.pause();
  }


  if (
    scareFootstep
  ) {
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
   RAYCASTER PAUSE FILTER
============================================================ */

function saveRaycasterObjects(
  entity
) {
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
  if (
    !entity
  ) {
    return;
  }


  saveRaycasterObjects(
    entity
  );


  entity.setAttribute(
    'raycaster',
    'objects',

    paused
      ? '.vr-control'
      : (
          entity.__roomsSavedRayObjects ||
          ''
        )
  );


  const raycaster =
    entity.components &&
    entity.components.raycaster;


  if (
    raycaster &&
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   COMPONENT PAUSE HELPERS
============================================================ */

function setComponentPaused(
  component,
  paused
) {
  if (
    !component
  ) {
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


function pauseEntityComponent(
  entity,
  name,
  paused
) {
  if (
    !entity ||
    !entity.components
  ) {
    return;
  }


  setComponentPaused(
    entity.components[
      name
    ],
    paused
  );
}


function pauseWorldComponents(
  paused
) {
  const rig =
    document.querySelector(
      '#rig'
    );


  const cam =
    document.querySelector(
      '#cam'
    );


  const door =
    document.querySelector(
      '#door'
    );


  const tv =
    document.querySelector(
      '#tv'
    );


  const incense =
    document.querySelector(
      '#incenseStick'
    );


  const incenseTip =
    document.querySelector(
      '#incenseTip'
    );


  const altar =
    document.querySelector(
      '#bantho'
    );


  const offeringManager =
    document.querySelector(
      '#offeringManager'
    );


  const mirror =
    document.querySelector(
      '#mirror'
    );


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


  /*
    New standalone tv.glb.
  */

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
    .querySelectorAll(
      '[flicker]'
    )
    .forEach(
      (entity) => {
        pauseEntityComponent(
          entity,
          'flicker',
          paused
        );
      }
    );


  document
    .querySelectorAll(
      '[proximity-light-reaction]'
    )
    .forEach(
      (entity) => {
        pauseEntityComponent(
          entity,
          'proximity-light-reaction',
          paused
        );
      }
    );
}


/* ============================================================
   PAUSE / RESUME GAME
============================================================ */

function setRoomsPaused(
  paused
) {
  roomsPaused =
    Boolean(
      paused
    );


  window.roomsPaused =
    roomsPaused;


  window.roomsInputLocked =
    roomsPaused;


  const scene =
    document.querySelector(
      'a-scene'
    );


  const rig =
    document.querySelector(
      '#rig'
    );


  const cam =
    document.querySelector(
      '#cam'
    );


  const leftHand =
    document.querySelector(
      '#leftHand'
    );


  const rightHand =
    document.querySelector(
      '#rightHand'
    );


  const cursor =
    cam
      ? cam.querySelector(
          'a-cursor'
        )
      : null;


  const immersiveXR =
    hasImmersiveXRSession(
      scene
    );


  /* --------------------------------------------------------
     MOVEMENT

     Quest remains teleport-only after leaving the menu.
  -------------------------------------------------------- */

  if (
    rig
  ) {
    rig.setAttribute(
      'movement-controls',
      'enabled',

      roomsPaused
        ? false
        : !immersiveXR
    );
  }


  /* --------------------------------------------------------
     CAMERA LOOK

     Never disable real headset tracking.
  -------------------------------------------------------- */

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


  /* --------------------------------------------------------
     TELEPORT
  -------------------------------------------------------- */

  if (
    leftHand
  ) {
    leftHand.setAttribute(
      'blink-controls',
      'enabled',
      !roomsPaused
    );
  }


  /* --------------------------------------------------------
     INTERACTIONS
  -------------------------------------------------------- */

  setRaycasterForPause(
    cursor,
    roomsPaused
  );


  setRaycasterForPause(
    rightHand,
    roomsPaused
  );


  /* --------------------------------------------------------
     WORLD
  -------------------------------------------------------- */

  pauseWorldComponents(
    roomsPaused
  );


  /* --------------------------------------------------------
     AUDIO
  -------------------------------------------------------- */

  if (
    roomsPaused
  ) {
    pauseRoomsAudio();

  } else {
    resumeRoomsAudio();
  }


  /* --------------------------------------------------------
     BROADCAST
  -------------------------------------------------------- */

  if (
    scene
  ) {
    scene.emit(
      'rooms-pause-changed',

      {
        paused:
          roomsPaused
      },

      false
    );
  }
}


/* ============================================================
   UI VISIBILITY
============================================================ */

function set3DPauseButtonVisible(
  visible
) {
  const button =
    document.querySelector(
      '#vrPauseButton'
    );


  if (
    button
  ) {
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


  if (
    panel
  ) {
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


  if (
    !button
  ) {
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


  if (
    !overlay
  ) {
    return;
  }


  overlay.classList.toggle(
    'is-open',
    Boolean(visible)
  );
}


function hideAllPauseUI() {
  set3DPauseButtonVisible(
    false
  );


  set3DPausePanelVisible(
    false
  );


  setDesktopPauseButtonVisible(
    false
  );


  setDesktopPauseOverlayVisible(
    false
  );
}


function syncPauseUI() {
  const scene =
    document.querySelector(
      'a-scene'
    );


  if (
    !scene
  ) {
    hideAllPauseUI();

    return;
  }


  const mode =
    getPauseUIMode(
      scene
    );


  /* ========================================================
     QUEST
  ======================================================== */

  if (
    mode ===
    'immersive-vr'
  ) {
    setDesktopPauseButtonVisible(
      false
    );


    setDesktopPauseOverlayVisible(
      false
    );


    /*
      Menu closed:
      show gear.

      Menu open:
      hide gear and show panel.
    */

    set3DPauseButtonVisible(
      !roomsPaused
    );


    set3DPausePanelVisible(
      roomsPaused
    );


    return;
  }


  /* ========================================================
     MAC / DESKTOP FULLSCREEN
  ======================================================== */

  if (
    mode ===
    'desktop-fullscreen'
  ) {
    set3DPauseButtonVisible(
      false
    );


    set3DPausePanelVisible(
      false
    );


    setDesktopPauseButtonVisible(
      !roomsPaused
    );


    setDesktopPauseOverlayVisible(
      roomsPaused
    );


    return;
  }


  /*
    Normal non-fullscreen browser.
  */

  hideAllPauseUI();
}


/* ============================================================
   OPEN / CLOSE SETTINGS
============================================================ */

function toggleRoomsPauseMenu(
  forceOpen
) {
  const scene =
    document.querySelector(
      'a-scene'
    );


  if (
    !scene
  ) {
    return;
  }


  const mode =
    getPauseUIMode(
      scene
    );


  /*
    Don't accidentally open a hidden menu in normal browser mode.
  */

  if (
    mode ===
      'normal-desktop' &&
    forceOpen !==
      false
  ) {
    return;
  }


  const shouldOpen =
    typeof forceOpen ===
      'boolean'

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
============================================================ */

function restartRoomsWithin() {
  window.location.reload();
}


/* ============================================================
   EXIT VR / FULLSCREEN
============================================================ */

async function exitRoomsWithin() {
  if (
    roomsPaused
  ) {
    setRoomsPaused(
      false
    );
  }


  hideAllPauseUI();


  const scene =
    document.querySelector(
      'a-scene'
    );


  if (
    scene &&
    scene.is &&
    scene.is(
      'vr-mode'
    ) &&
    scene.exitVR
  ) {
    try {
      const result =
        scene.exitVR();


      if (
        result &&
        typeof result.then ===
          'function'
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
   GLOBAL UI FUNCTIONS
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
   LEGACY CAMERA CORNER COMPONENT

   The new index.html does NOT need this anymore.

   #vrPauseButton and #vrPausePanel are already children of #cam,
   meaning the headset naturally carries them around.

   The component stays registered only so older HTML does not
   throw an unknown-component warning.
============================================================ */

AFRAME.registerComponent(
  'camera-corner-ui',
  {
    init:
      function () {
        /*
          Intentionally empty.
        */
      }
  }
);


/* ============================================================
   DESKTOP POINTER COMPATIBILITY
============================================================ */

AFRAME.registerComponent(
  'desktop-vr-ui-pointer',
  {
    init:
      function () {
        /*
          Mac fullscreen uses HTML settings UI now.
        */
      },


    remove:
      function () {
        const canvas =
          this.el &&
          this.el.renderer
            ? this.el.renderer.domElement
            : null;


        if (
          canvas
        ) {
          canvas.style.cursor =
            '';
        }
      }
  }
);


/* ============================================================
   QUEST RIGHT-HAND SETTINGS INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-ui-interactor',
  {
    schema: {
      pressThreshold: {
        default:
          0.65
      },


      releaseThreshold: {
        default:
          0.2
      }
    },


    init:
      function () {
        this.triggerHeld =
          false;


        this.pressTrigger =
          this.pressTrigger.bind(
            this
          );


        this.releaseTrigger =
          this.releaseTrigger.bind(
            this
          );


        this.onTriggerChanged =
          this.onTriggerChanged.bind(
            this
          );


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


    pressTrigger:
      function (
        event
      ) {
        if (
          this.triggerHeld
        ) {
          return;
        }


        if (
          !hasImmersiveXRSession(
            this.el.sceneEl
          )
        ) {
          return;
        }


        /*
          Do NOT use stopImmediatePropagation.

          audio.js is also allowed to receive the same Quest
          trigger gesture so it can unlock the sound.
        */

        if (
          event &&
          event.stopPropagation
        ) {
          event.stopPropagation();
        }


        this.triggerHeld =
          true;


        this.useUI();
      },


    releaseTrigger:
      function () {
        this.triggerHeld =
          false;
      },


    onTriggerChanged:
      function (
        event
      ) {
        const value =
          event &&
          event.detail &&
          typeof event.detail.value ===
            'number'

            ? event.detail.value

            : null;


        if (
          value === null
        ) {
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


    useUI:
      function () {
        if (
          !hasImmersiveXRSession(
            this.el.sceneEl
          )
        ) {
          return;
        }


        const raycaster =
          this.el.components.raycaster;


        if (
          !raycaster
        ) {
          return;
        }


        if (
          raycaster.refreshObjects
        ) {
          raycaster.refreshObjects();
        }


        const hit =
          (
            element
          ) => {
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


        /* ====================================================
           MENU CLOSED
        ==================================================== */

        if (
          !roomsPaused
        ) {
          if (
            hit(
              gear
            )
          ) {
            toggleRoomsPauseMenu(
              true
            );
          }


          return;
        }


        /* ====================================================
           MENU OPEN
        ==================================================== */

        if (
          !panel ||
          !isAFrameVisible(
            panel
          )
        ) {
          return;
        }


        /* RESUME */

        if (
          hit(
            resume
          )
        ) {
          toggleRoomsPauseMenu(
            false
          );

          return;
        }


        /* SOUND */

        if (
          hit(
            sound
          )
        ) {
          if (
            window.toggleRoomsMute
          ) {
            window.toggleRoomsMute();
          }


          window.setTimeout(
            updatePauseSoundLabels,
            0
          );


          return;
        }


        /* RESTART */

        if (
          hit(
            restart
          )
        ) {
          restartRoomsWithin();

          return;
        }


        /* EXIT */

        if (
          hit(
            exit
          )
        ) {
          exitRoomsWithin();
        }
      },


    remove:
      function () {
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
   UI FLOW MANAGER
============================================================ */

AFRAME.registerComponent(
  'ui-flow-manager',
  {
    init:
      function () {
        this.sync =
          this.sync.bind(
            this
          );


        this.updateAudioUI =
          this.updateAudioUI.bind(
            this
          );


        this.onEnterVR =
          this.onEnterVR.bind(
            this
          );


        this.onExitVR =
          this.onExitVR.bind(
            this
          );


        this.onFullscreenChange =
          this.onFullscreenChange.bind(
            this
          );


        this.onKeyDown =
          this.onKeyDown.bind(
            this
          );


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


    onEnterVR:
      function () {
        /*
          A-Frame can fire enter-vr shortly before the renderer
          reports the Quest XR session.

          Re-check a few times so the gear reliably appears inside
          the headset.
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
          200
        );


        window.setTimeout(
          this.sync,
          500
        );


        window.setTimeout(
          this.sync,
          1000
        );
      },


    onExitVR:
      function () {
        if (
          roomsPaused
        ) {
          setRoomsPaused(
            false
          );
        }


        hideAllPauseUI();


        this.sync();


        window.setTimeout(
          this.sync,
          100
        );
      },


    onFullscreenChange:
      function () {
        const mode =
          getPauseUIMode(
            this.el
          );


        if (
          mode ===
            'normal-desktop' &&
          roomsPaused
        ) {
          setRoomsPaused(
            false
          );
        }


        this.sync();
      },


    onKeyDown:
      function (
        event
      ) {
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
          ) !==
          'desktop-fullscreen'
        ) {
          return;
        }


        const key =
          String(
            event.key || ''
          )
            .toLowerCase();


        if (
          key === 'p' ||
          event.key ===
            'Escape'
        ) {
          event.preventDefault();


          toggleRoomsPauseMenu();
        }
      },


    sync:
      function () {
        syncPauseUI();


        const canvas =
          this.el.renderer
            ? this.el.renderer.domElement
            : null;


        if (
          canvas
        ) {
          canvas.style.cursor =
            getPauseUIMode(
              this.el
            ) ===
              'desktop-fullscreen' &&
            roomsPaused

              ? 'default'

              : '';
        }
      },


    updateAudioUI:
      function () {
        updatePauseSoundLabels();
      },


    remove:
      function () {
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
    init:
      function () {
        const manager =
          document.querySelector(
            '#story-manager'
          );


        if (
          !manager
        ) {
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
            once:
              true
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
        type:
          'selector'
      }
    },


    play:
      function () {
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
    init:
      function () {
        const manager =
          document.querySelector(
            '#story-manager'
          );


        if (
          !manager
        ) {
          return;
        }


        this.hasTriggered =
          false;


        manager.addEventListener(
          'all-clues-collected',

          () =>
            this.trigger(),

          {
            once:
              true
          }
        );
      },


    trigger:
      async function () {
        if (
          this.hasTriggered
        ) {
          return;
        }


        this.hasTriggered =
          true;


        /*
          Do not advance while paused.
        */

        await waitRoomsMilliseconds(
          1
        );


        const scareSteps =
          document.querySelector(
            '#scareFootstepAudio'
          );


        if (
          scareSteps
        ) {
          const state =
            window.getRoomsAudioState

              ? window.getRoomsAudioState()

              : {
                  muted:
                    false,

                  volume:
                    1
                };


          scareSteps.volume =
            state.muted

              ? 0

              : 0.35 *
                (
                  state.volume !==
                    undefined

                    ? state.volume

                    : 1
                );


          scareSteps.currentTime =
            0;


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
            /*
              Best effort only.
            */
          }
        }


        await waitRoomsMilliseconds(
          500
        );


        const character =
          document.querySelector(
            '#scare-character'
          );


        if (
          character
        ) {
          character.setAttribute(
            'visible',
            true
          );
        }


        await waitRoomsMilliseconds(
          1800
        );


        if (
          character
        ) {
          character.setAttribute(
            'visible',
            false
          );
        }


        if (
          scareSteps
        ) {
          scareSteps.pause();


          scareSteps.currentTime =
            0;
        }
      }
  }
);


/* ============================================================
   DEBUG

   Browser console:

   getRoomsUIDebug()
============================================================ */

function getRoomsUIDebug() {
  const scene =
    document.querySelector(
      'a-scene'
    );


  const cam =
    document.querySelector(
      '#cam'
    );


  const gear =
    document.querySelector(
      '#vrPauseButton'
    );


  const panel =
    document.querySelector(
      '#vrPausePanel'
    );


  const soundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );


  return {
    mode:
      scene
        ? getPauseUIMode(
            scene
          )
        : 'no-scene',


    immersiveXR:
      hasImmersiveXRSession(
        scene
      ),


    paused:
      roomsPaused,


    inputLocked:
      Boolean(
        window.roomsInputLocked
      ),


    gearFound:
      Boolean(
        gear
      ),


    gearVisible:
      isAFrameVisible(
        gear
      ),


    gearParentIsCamera:
      Boolean(
        gear &&
        cam &&
        gear.parentElement ===
          cam
      ),


    panelFound:
      Boolean(
        panel
      ),


    panelVisible:
      isAFrameVisible(
        panel
      ),


    panelParentIsCamera:
      Boolean(
        panel &&
        cam &&
        panel.parentElement ===
          cam
      ),


    soundLabel:
      soundLabel
        ? soundLabel.getAttribute(
            'value'
          )
        : null
  };
}


window.getRoomsUIDebug =
  getRoomsUIDebug;


/* ============================================================
   INITIAL UI SYNC
============================================================ */

window.addEventListener(
  'DOMContentLoaded',

  () => {
    updatePauseSoundLabels();

    syncPauseUI();
  }
);