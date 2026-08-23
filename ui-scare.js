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
    /*
      Current incense.js smoke component.
    */
    setComponentPaused(
      incenseTip.components[
        'incense-smoke'
      ],
      paused
    );

    /*
      Safe compatibility if the separate
      incense-smoke.js file is used later.
    */
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
    ui-scare.js is the only current file
    that writes this global.

    Other systems read it, so keeping it
    synchronized with pause is safe for
    the current project.
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

     FIX:
     In real Quest VR, smooth movement must
     stay OFF even after closing the pause
     menu.

     Teleport remains the comfort method.
  ---------------------------------------------------------- */

  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      roomsPaused
        ? false
        : !immersiveXR
    );
  }


  /* ----------------------------------------------------------
     LOOK CONTROLS

     Keep real headset tracking alive.

     Freeze desktop mouse-look while the
     HTML pause menu is open.
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

  /*
    META QUEST / REAL WEBXR
  */
  if (mode === 'immersive-vr') {
    setDesktopPauseButtonVisible(
      false
    );

    setDesktopPauseOverlayVisible(
      false
    );

    set3DPauseButtonVisible(
      !roomsPaused
    );

    set3DPausePanelVisible(
      roomsPaused
    );

    return;
  }


  /*
    MAC / DESKTOP A-FRAME FULLSCREEN
  */
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


  /*
    NORMAL DESKTOP BROWSER

    No pause controls should appear.
  */
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

    This protects normal desktop browsing
    from accidentally opening a hidden
    pause overlay through an old event.
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
============================================================ */

function restartRoomsWithin() {
  window.location.reload();
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
   CAMERA-CORNER 3D GEAR

   Used only in real immersive VR after
   the UI-mode fix.
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
        time -
          this.lastUpdate <
        150
      ) {
        return;
      }

      this.lastUpdate = time;

      const cameraEl =
        document.querySelector(
          '#cam'
        );

      const camera =
        cameraEl
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
        Math.tan(
          fov / 2
        ) *
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
        halfHeight *
        aspect;

      const xMagnitude =
        halfWidth *
        (
          1 -
          this.data
            .horizontalInset
        );

      const yMagnitude =
        halfHeight *
        (
          1 -
          this.data
            .verticalInset
        );

      const x =
        this.data.side ===
        'left'
          ? -xMagnitude
          : xMagnitude;

      const y =
        this.data
          .verticalAnchor ===
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

   The old version used mouse raycasting
   against the 3D Quest menu in Mac
   fullscreen.

   That is intentionally no longer needed
   because Mac fullscreen now uses the HTML
   menu.

   The component stays registered because
   the current index.html still includes:

   desktop-vr-ui-pointer
============================================================ */

AFRAME.registerComponent(
  'desktop-vr-ui-pointer',
  {
    init: function () {
      /*
        Intentionally empty.
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


    pressTrigger: function (event) {
      if (this.triggerHeld) {
        return;
      }

      /*
        This interactor is ONLY for genuine
        immersive VR.

        It should not steal trigger presses
        in desktop mode.
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

      if (
        raycaster.refreshObjects
      ) {
        raycaster.refreshObjects();
      }

      const hit =
        (element) => {
          if (
            !element ||
            !raycaster
              .getIntersection
          ) {
            return null;
          }

          return raycaster
            .getIntersection(
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
        !pausePanel.getAttribute(
          'visible'
        )
      ) {
        return;
      }


      if (hit(resumeButton)) {
        toggleRoomsPauseMenu(
          false
        );

        return;
      }


      if (hit(soundButton)) {
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
   UI FLOW MANAGER
============================================================ */

AFRAME.registerComponent(
  'ui-flow-manager',
  {
    init: function () {
      this.sync =
        this.sync.bind(this);

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


    onEnterVR: function () {
      /*
        On Quest, A-Frame may emit enter-vr
        slightly before renderer.xr.isPresenting
        becomes true.

        Hide everything first, then re-check
        after the XR session settles.

        Desktop fullscreen will resolve to
        the HTML UI.
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


    onFullscreenChange:
      function () {
        /*
          If fullscreen closes while paused,
          resume the game so the normal browser
          page cannot be left invisibly locked.
        */

        const mode =
          getPauseUIMode(
            this.el
          );

        if (
          mode ===
            'normal-desktop' &&
          roomsPaused
        ) {
          setRoomsPaused(false);
        }

        this.sync();
      },


    onKeyDown: function (event) {
      /*
        Keyboard pause is for desktop only.
        Do not respond to keyboard events
        while inside genuine Quest WebXR.
      */
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

      const key =
        String(
          event.key || ''
        ).toLowerCase();

      /*
        P is the reliable desktop fallback.

        Escape is also supported where the
        browser allows it.
      */
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

      const mode =
        getPauseUIMode(
          this.el
        );

      const canvas =
        this.el.renderer
          ? this.el.renderer
              .domElement
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

          paused:
            roomsPaused
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
        If story completion happens while
        paused, the scare sequence does not
        advance until gameplay is resumed.
      */

      await waitRoomsMilliseconds(
        1
      );


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

        scareSteps.currentTime =
          0;

        scareSteps
          .play()
          .catch(
            (error) => {
              console.error(
                'Scare footstep sound failed:',
                error
              );
            }
          );
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

        scareSteps.currentTime =
          0;
      }
    }
  }
);