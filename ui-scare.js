/* ============================================================
   ui-scare.js — ROOMS WITHIN
   Final Mac + Quest pause/settings fix.
============================================================ */

let roomsPaused = false;
window.roomsPaused = false;
window.roomsInputLocked = false;

function hasImmersiveXRSession(scene) {
  try {
    if (!scene || !scene.renderer || !scene.renderer.xr) return false;

    const xr = scene.renderer.xr;

    if (xr.getSession && xr.getSession()) return true;

    return Boolean(xr.isPresenting);
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
  return Boolean(
    hasImmersiveXRSession(scene) ||
    isDesktopAFrameVR(scene) ||
    isBrowserFullscreen()
  );
}


/* ============================================================
   PAUSE-AWARE TIMER
============================================================ */

function waitRoomsMilliseconds(milliseconds) {
  return new Promise((resolve) => {
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

      previous = now;

      if (!window.roomsPaused) {
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
   SOUND LABEL
============================================================ */

function updatePauseSoundLabels() {
  let muted = false;

  if (window.getRoomsAudioState) {
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

  const text =
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

  if (screenButton) {
    screenButton.textContent =
      text;
  }

  if (vrLabel) {
    vrLabel.setAttribute(
      'value',
      text
    );
  }
}


/* ============================================================
   AUDIO
============================================================ */

function pauseRoomsAudio() {
  document
    .querySelectorAll(
      '.spatial-sound'
    )
    .forEach(
      (entity) => {
        const sound =
          entity.components.sound;

        if (
          sound &&
          sound.pauseSound
        ) {
          sound.pauseSound();
        }
      }
    );

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
   world objects cannot be clicked.
   Only .vr-control remains clickable.
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

  saveRaycasterObjects(
    entity
  );

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
  }

  if (
    !paused &&
    typeof component.play ===
      'function'
  ) {
    component.play();
  }
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

  const living =
    document.querySelector(
      '#living'
    );

  const incense =
    document.querySelector(
      '#incenseStick'
    );

  const incenseTip =
    document.querySelector(
      '#incenseTip'
    );

  const mirror =
    document.querySelector(
      '#mirror'
    );

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
      cam.components[
        'head-bob'
      ],
      paused
    );
  }

  if (door) {
    setComponentPaused(
      door.components[
        'door-hinge'
      ],
      paused
    );
  }

  if (living) {
    setComponentPaused(
      living.components[
        'embedded-tv'
      ],
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
    setComponentPaused(
      incenseTip.components[
        'incense-smoke'
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
    .querySelectorAll(
      '[flicker]'
    )
    .forEach(
      (entity) => {
        setComponentPaused(
          entity.components.flicker,
          paused
        );
      }
    );
}


/* ============================================================
   PAUSE / RESUME
============================================================ */

function setRoomsPaused(
  paused
) {
  roomsPaused =
    Boolean(paused);

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

  /* Movement */

  if (rig) {
    rig.setAttribute(
      'movement-controls',
      'enabled',
      !roomsPaused
    );
  }

  /*
    Keep Quest head tracking.

    On Mac, freeze looking while
    pause menu is open.
  */

  if (
    cam &&
    !hasImmersiveXRSession(
      scene
    )
  ) {
    cam.setAttribute(
      'look-controls',
      'enabled',
      !roomsPaused
    );
  }

  /* Quest teleport */

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


function closeDesktopHTMLPauseUI() {
  const button =
    document.querySelector(
      '#screenPauseButton'
    );

  const overlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  if (button) {
    button.classList.remove(
      'is-visible'
    );
  }

  if (overlay) {
    overlay.classList.remove(
      'is-open'
    );
  }
}


/* ============================================================
   OPEN / CLOSE MENU
============================================================ */

function toggleRoomsPauseMenu(
  forceOpen
) {
  const scene =
    document.querySelector(
      'a-scene'
    );

  if (!scene) {
    return;
  }

  const use3DMenu =
    shouldUse3DPauseUI(
      scene
    );

  const screenOverlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  const shouldOpen =
    typeof forceOpen ===
    'boolean'
      ? forceOpen
      : !roomsPaused;

  if (use3DMenu) {
    closeDesktopHTMLPauseUI();

    set3DPausePanelVisible(
      shouldOpen
    );

    set3DPauseButtonVisible(
      !shouldOpen
    );
  } else {
    set3DPausePanelVisible(
      false
    );

    set3DPauseButtonVisible(
      false
    );

    if (screenOverlay) {
      screenOverlay
        .classList
        .toggle(
          'is-open',
          shouldOpen
        );
    }
  }

  setRoomsPaused(
    shouldOpen
  );

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
    toggleRoomsPauseMenu(
      false
    );
  }

  const scene =
    document.querySelector(
      'a-scene'
    );

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
      document.fullscreenElement
    ) {
      await document
        .exitFullscreen();
    } else if (
      document
        .webkitFullscreenElement &&
      document
        .webkitExitFullscreen
    ) {
      document
        .webkitExitFullscreen();
    }
  } catch (error) {
    console.error(
      'Could not exit browser fullscreen:',
      error
    );
  }
}


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


/* ============================================================
   CAMERA CORNER GEAR
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

      this.lastUpdate =
        time;

      const cameraEl =
        document.querySelector(
          '#cam'
        );

      const camera =
        cameraEl
          ? cameraEl
              .getObject3D(
                'camera'
              )
          : null;

      if (!camera) {
        return;
      }

      const distance =
        this.data.distance;

      const fov =
        THREE.MathUtils
          .degToRad(
            camera.fov ||
            60
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

      this.el.object3D
        .position
        .set(
          x,
          y,
          -distance
        );
    }
  }
);


/* ============================================================
   MAC FULLSCREEN MOUSE -> 3D UI

   This is separate from the centre crosshair.

   World:
   centre crosshair + click

   Pause/settings:
   normal mouse/trackpad pointer
============================================================ */

AFRAME.registerComponent(
  'desktop-vr-ui-pointer',
  {
    init: function () {
      this.raycaster =
        new THREE.Raycaster();

      this.pointer =
        new THREE.Vector2();

      this.onPointerMove =
        this.onPointerMove
          .bind(this);

      this.onPointerDown =
        this.onPointerDown
          .bind(this);

      document.addEventListener(
        'pointermove',
        this.onPointerMove,
        true
      );

      document.addEventListener(
        'pointerdown',
        this.onPointerDown,
        true
      );
    },


    isActive: function () {
      return Boolean(
        !hasImmersiveXRSession(
          this.el
        ) &&
        (
          isDesktopAFrameVR(
            this.el
          ) ||
          isBrowserFullscreen()
        )
      );
    },


    getCanvas: function () {
      return (
        this.el &&
        this.el.renderer
          ? this.el.renderer
              .domElement
          : null
      );
    },


    setPointerFromEvent:
      function (event) {
        const canvas =
          this.getCanvas();

        if (!canvas) {
          return false;
        }

        const rect =
          canvas
            .getBoundingClientRect();

        if (
          !rect.width ||
          !rect.height
        ) {
          return false;
        }

        this.pointer.x =
          (
            (
              event.clientX -
              rect.left
            ) /
            rect.width
          ) *
          2 -
          1;

        this.pointer.y =
          -(
            (
              event.clientY -
              rect.top
            ) /
            rect.height
          ) *
          2 +
          1;

        return true;
      },


    getCamera: function () {
      const cameraEl =
        document.querySelector(
          '#cam'
        );

      return cameraEl
        ? cameraEl
            .getObject3D(
              'camera'
            )
        : null;
    },


    elementIsVisible:
      function (element) {
        if (!element) {
          return false;
        }

        if (
          element.getAttribute(
            'visible'
          ) === false
        ) {
          return false;
        }

        return Boolean(
          element.object3D &&
          element.object3D
            .visible !== false
        );
      },


    hitElement:
      function (element) {
        if (
          !this.elementIsVisible(
            element
          ) ||
          !element.object3D
        ) {
          return null;
        }

        const hits =
          this.raycaster
            .intersectObject(
              element.object3D,
              true
            );

        return hits.length
          ? hits[0]
          : null;
      },


    getHitControl:
      function () {
        const controls =
          roomsPaused
            ? [
                document.querySelector(
                  '#vrResumeButton'
                ),

                document.querySelector(
                  '#vrSoundButton'
                ),

                document.querySelector(
                  '#vrRestartButton'
                ),

                document.querySelector(
                  '#vrExitButton'
                )
              ]
            : [
                document.querySelector(
                  '#vrPauseButton'
                )
              ];

        let closest =
          null;

        controls.forEach(
          (element) => {
            const hit =
              this.hitElement(
                element
              );

            if (!hit) {
              return;
            }

            if (
              !closest ||
              hit.distance <
              closest.hit.distance
            ) {
              closest = {
                element,
                hit
              };
            }
          }
        );

        return closest;
      },


    prepareRay:
      function (event) {
        if (
          !this.isActive() ||
          !this
            .setPointerFromEvent(
              event
            )
        ) {
          return false;
        }

        const camera =
          this.getCamera();

        if (!camera) {
          return false;
        }

        camera.updateMatrixWorld(
          true
        );

        this.raycaster
          .setFromCamera(
            this.pointer,
            camera
          );

        return true;
      },


    onPointerMove:
      function (event) {
        if (
          !this.prepareRay(
            event
          )
        ) {
          return;
        }

        const canvas =
          this.getCanvas();

        const hit =
          this.getHitControl();

        if (canvas) {
          canvas.style.cursor =
            hit
              ? 'pointer'
              : 'default';
        }
      },


    onPointerDown:
      function (event) {
        if (
          event.button !==
            undefined &&
          event.button !== 0
        ) {
          return;
        }

        if (
          !this.prepareRay(
            event
          )
        ) {
          return;
        }

        const result =
          this.getHitControl();

        if (!result) {
          return;
        }

        /*
          Prevent this UI click
          from also clicking a
          world object at the
          centre crosshair.
        */

        event.preventDefault();
        event.stopPropagation();

        const id =
          result.element.id;

        if (
          id ===
          'vrPauseButton'
        ) {
          toggleRoomsPauseMenu();
          return;
        }

        if (
          id ===
          'vrResumeButton'
        ) {
          toggleRoomsPauseMenu(
            false
          );

          return;
        }

        if (
          id ===
          'vrSoundButton'
        ) {
          if (
            window
              .toggleRoomsMute
          ) {
            window
              .toggleRoomsMute();
          }

          window.setTimeout(
            updatePauseSoundLabels,
            0
          );

          return;
        }

        if (
          id ===
          'vrRestartButton'
        ) {
          restartRoomsWithin();
          return;
        }

        if (
          id ===
          'vrExitButton'
        ) {
          exitRoomsWithin();
        }
      },


    remove: function () {
      document
        .removeEventListener(
          'pointermove',
          this.onPointerMove,
          true
        );

      document
        .removeEventListener(
          'pointerdown',
          this.onPointerDown,
          true
        );

      const canvas =
        this.getCanvas();

      if (canvas) {
        canvas.style.cursor = '';
      }
    }
  }
);


/* ============================================================
   QUEST RIGHT HAND -> PAUSE UI
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
      this.triggerHeld =
        false;

      this.pressTrigger =
        this.pressTrigger
          .bind(this);

      this.releaseTrigger =
        this.releaseTrigger
          .bind(this);

      this.onTriggerChanged =
        this.onTriggerChanged
          .bind(this);

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
      function (event) {
        if (
          this.triggerHeld
        ) {
          return;
        }

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
      function (event) {
        const value =
          event &&
          event.detail &&
          typeof event
            .detail.value ===
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
            this.data
              .pressThreshold &&
          !this.triggerHeld
        ) {
          this.pressTrigger();
        } else if (
          value <=
          this.data
            .releaseThreshold
        ) {
          this.releaseTrigger();
        }
      },


    useUI: function () {
      const raycaster =
        this.el.components
          .raycaster;

      if (!raycaster) {
        return;
      }

      if (
        raycaster
          .refreshObjects
      ) {
        raycaster
          .refreshObjects();
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

      if (
        hit(pauseButton)
      ) {
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

      if (
        hit(resumeButton)
      ) {
        toggleRoomsPauseMenu(
          false
        );

        return;
      }

      if (
        hit(soundButton)
      ) {
        if (
          window.toggleRoomsMute
        ) {
          window
            .toggleRoomsMute();
        }

        window.setTimeout(
          updatePauseSoundLabels,
          0
        );

        return;
      }

      if (
        hit(restartButton)
      ) {
        restartRoomsWithin();
        return;
      }

      if (
        hit(exitButton)
      ) {
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
   UI FLOW
============================================================ */

AFRAME.registerComponent(
  'ui-flow-manager',
  {
    init: function () {
      this.hasEnteredVR =
        false;

      this.sync =
        this.sync.bind(this);

      this.updateAudioUI =
        this.updateAudioUI
          .bind(this);

      this.onEnterVR =
        this.onEnterVR
          .bind(this);

      this.onExitVR =
        this.onExitVR
          .bind(this);

      this.onFullscreenChange =
        this
          .onFullscreenChange
          .bind(this);

      this.onKeyDown =
        this.onKeyDown
          .bind(this);

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

      document
        .addEventListener(
          'fullscreenchange',
          this
            .onFullscreenChange
        );

      document
        .addEventListener(
          'webkitfullscreenchange',
          this
            .onFullscreenChange
        );

      document
        .addEventListener(
          'keydown',
          this.onKeyDown
        );

      /*
        Automatically activate
        Mac mouse -> 3D UI.
      */

      if (
        !this.el
          .hasAttribute(
            'desktop-vr-ui-pointer'
          )
      ) {
        this.el.setAttribute(
          'desktop-vr-ui-pointer',
          ''
        );
      }

      this.sync();
      this.updateAudioUI();
    },


    onEnterVR: function () {
      this.hasEnteredVR =
        true;

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
      this.hasEnteredVR =
        false;

      if (roomsPaused) {
        toggleRoomsPauseMenu(
          false
        );
      }

      this.sync();

      window.setTimeout(
        this.sync,
        100
      );
    },


    onFullscreenChange:
      function () {
        this.sync();
      },


    onKeyDown:
      function (event) {
        const desktopMode =
          !hasImmersiveXRSession(
            this.el
          ) &&
          (
            isDesktopAFrameVR(
              this.el
            ) ||
            isBrowserFullscreen() ||
            this.hasEnteredVR
          );

        /*
          Backup keyboard:
          ESC or P
        */

        if (
          desktopMode &&
          (
            event.key ===
              'Escape' ||
            String(
              event.key || ''
            ).toLowerCase() ===
              'p'
          )
        ) {
          event.preventDefault();

          toggleRoomsPauseMenu();
        }
      },


    sync: function () {
      const immersive =
        hasImmersiveXRSession(
          this.el
        );

      const desktopVR =
        isDesktopAFrameVR(
          this.el
        );

      const fullscreen =
        isBrowserFullscreen();

      const show3DUI =
        Boolean(
          immersive ||
          desktopVR ||
          (
            this.hasEnteredVR &&
            !immersive
          ) ||
          (
            fullscreen &&
            !immersive
          )
        );

      /*
        Hide old HTML overlay
        in fullscreen.

        Use the 3D version
        instead.
      */

      closeDesktopHTMLPauseUI();

      set3DPauseButtonVisible(
        show3DUI &&
        !roomsPaused
      );

      set3DPausePanelVisible(
        show3DUI &&
        roomsPaused
      );

      const canvas =
        this.el.renderer
          ? this.el.renderer
              .domElement
          : null;

      if (
        canvas &&
        !immersive &&
        show3DUI
      ) {
        canvas.style.cursor =
          'default';
      }

      console.log(
        'Pause UI mode:',
        {
          immersiveXR:
            immersive,

          desktopAFrameVR:
            desktopVR,

          browserFullscreen:
            fullscreen,

          hasEnteredVR:
            this.hasEnteredVR,

          show3DUI:
            show3DUI
        }
      );
    },


    updateAudioUI:
      function () {
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
        this
          .onFullscreenChange
      );

      document.removeEventListener(
        'webkitfullscreenchange',
        this
          .onFullscreenChange
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

      this.hasTriggered =
        false;

      manager.addEventListener(
        'all-clues-collected',
        () => this.trigger(),
        {
          once: true
        }
      );
    },


    trigger: async function () {
      if (
        this.hasTriggered
      ) {
        return;
      }

      this.hasTriggered =
        true;

      /*
        If triggered during pause,
        wait for unpaused time.
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
          window
            .getRoomsAudioState
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
                audioState
                  .volume !==
                undefined
                  ? audioState
                      .volume
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