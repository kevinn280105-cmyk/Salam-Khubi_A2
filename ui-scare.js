/* ============================================================
   ui-scare.js

   RESPONSIBILITIES:
   - Mac/fullscreen Settings button
   - Mac/fullscreen Exit button
   - Quest VR Settings button
   - Quest VR Exit button
   - Volume controls
   - Tutorial connection
   - Intro hook
   - Jumpscare

   IMPORTANT:
   The actual button entities and HTML buttons are created
   inside index.html.

   This file controls their behaviour.
============================================================ */


/* ============================================================
   CHECK FOR REAL IMMERSIVE VR

   This specifically checks whether WebXR is presenting
   through a real headset such as Meta Quest.

   Mac fullscreen is NOT counted as immersive VR here.
============================================================ */

function isImmersiveXR(scene) {

  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}


/* ============================================================
   MAC SETTINGS PANEL
============================================================ */

function toggleRoomsSettings(
  forceOpen
) {

  const panel =
    document.querySelector(
      '#screenSettingsPanel'
    );


  if (!panel) {
    return;
  }


  /*
    If forceOpen is true/false,
    use that exact state.

    Otherwise toggle the current state.
  */
  const shouldOpen =
    typeof forceOpen ===
      'boolean'

      ? forceOpen

      : !panel.classList
          .contains(
            'is-open'
          );


  panel.classList.toggle(
    'is-open',
    shouldOpen
  );
}


/* ============================================================
   EXIT VR / FULLSCREEN

   Quest:
     exits the WebXR session.

   Mac:
     exits A-Frame VR/fullscreen mode
     and browser fullscreen if necessary.
============================================================ */

async function exitRoomsWithin() {

  const scene =
    document.querySelector(
      'a-scene'
    );


  /* ========================================================
     EXIT A-FRAME / WEBXR
  ======================================================== */

  try {

    if (
      scene &&
      (
        isImmersiveXR(
          scene
        ) ||

        scene.is(
          'vr-mode'
        )
      )
    ) {

      const result =
        scene.exitVR();


      /*
        Some versions return a Promise,
        some may not.
      */
      if (
        result &&
        typeof result.then ===
          'function'
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


  /* ========================================================
     EXIT BROWSER FULLSCREEN

     Useful on Mac.
  ======================================================== */

  try {

    if (
      document.fullscreenElement
    ) {

      await document
        .exitFullscreen();


    /*
      Safari compatibility.
    */
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


/* ============================================================
   MAKE FUNCTIONS AVAILABLE TO index.html

   index.html buttons use:

   onclick="toggleRoomsSettings()"
   onclick="exitRoomsWithin()"
============================================================ */

window.toggleRoomsSettings =
  toggleRoomsSettings;


window.exitRoomsWithin =
  exitRoomsWithin;


/* ============================================================
   UI FLOW MANAGER

   Attach this to <a-scene>:

   <a-scene ui-flow-manager>

   Controls when Mac UI and Quest UI appear.
============================================================ */

AFRAME.registerComponent(
  'ui-flow-manager',
  {

    init: function () {

      /*
        False while player is on the normal page.

        Becomes true when A-Frame fires
        the enter-vr event.
      */
      this.hasEnteredVR =
        false;


      this.sync =
        this.sync.bind(
          this
        );


      this.updateAudioUI =
        this.updateAudioUI.bind(
          this
        );


      /* ====================================================
         ENTER VR
      ==================================================== */

      this.el.addEventListener(
        'enter-vr',

        () => {

          this.hasEnteredVR =
            true;


          /*
            First check immediately.

            This is useful for Mac.
          */
          this.sync();


          /*
            Then check again after WebXR has
            had a moment to begin.

            This is useful on Quest because
            renderer.xr.isPresenting may not
            become true on the exact same frame.
          */
          window.setTimeout(
            this.sync,
            250
          );
        }
      );


      /* ====================================================
         EXIT VR
      ==================================================== */

      this.el.addEventListener(
        'exit-vr',

        () => {

          this.hasEnteredVR =
            false;


          /*
            Close desktop Settings menu.
          */
          toggleRoomsSettings(
            false
          );


          this.sync();
        }
      );


      /* ====================================================
         AUDIO SETTINGS CHANGED

         audio.js emits this event.
      ==================================================== */

      this.el.addEventListener(
        'audio-settings-changed',
        this.updateAudioUI
      );


      /* ====================================================
         DESKTOP FULLSCREEN CHANGES
      ==================================================== */

      document.addEventListener(
        'fullscreenchange',
        this.sync
      );


      /*
        Safari compatibility.
      */
      document.addEventListener(
        'webkitfullscreenchange',
        this.sync
      );


      /*
        Initial state.
      */
      this.sync();


      this.updateAudioUI();
    },


    /* ======================================================
       SHOW CORRECT CONTROLS
    ====================================================== */

    sync: function () {

      const immersive =
        isImmersiveXR(
          this.el
        );


      /*
        MAC:

        Settings and Exit buttons appear only
        after the user pressed Enter VR.

        They do NOT appear on the normal page.

        They are also hidden during real Quest VR
        because Quest uses 3D buttons instead.
      */
      const showMacControls =
        this.hasEnteredVR &&
        !immersive;


      const settingsButton =
        document.querySelector(
          '#screenSettingsButton'
        );


      const exitButton =
        document.querySelector(
          '#screenExitButton'
        );


      if (settingsButton) {

        settingsButton
          .classList.toggle(
            'is-visible',
            showMacControls
          );
      }


      if (exitButton) {

        exitButton
          .classList.toggle(
            'is-visible',
            showMacControls
          );
      }


      /*
        Close Settings menu whenever
        Mac controls are hidden.
      */
      if (!showMacControls) {

        toggleRoomsSettings(
          false
        );
      }


      /* ====================================================
         QUEST VR BUTTONS

         HTML buttons cannot normally appear
         inside immersive WebXR.

         Quest therefore uses 3D A-Frame
         entities attached to the camera.
      ==================================================== */

      const vrSettingsButton =
        document.querySelector(
          '#vrSettingsButton'
        );


      const vrExitButton =
        document.querySelector(
          '#vrExitButton'
        );


      const vrSettingsPanel =
        document.querySelector(
          '#vrSettingsPanel'
        );


      if (vrSettingsButton) {

        vrSettingsButton
          .setAttribute(
            'visible',
            immersive
          );
      }


      if (vrExitButton) {

        vrExitButton
          .setAttribute(
            'visible',
            immersive
          );
      }


      /*
        Hide Quest Settings panel
        when leaving immersive VR.
      */
      if (
        vrSettingsPanel &&
        !immersive
      ) {

        vrSettingsPanel
          .setAttribute(
            'visible',
            false
          );
      }
    },


    /* ======================================================
       UPDATE VOLUME TEXT

       Example:

       100%
       80%
       50%
       MUTE
    ====================================================== */

    updateAudioUI:
      function () {

        if (
          !window
            .getRoomsAudioState
        ) {
          return;
        }


        const state =
          window
            .getRoomsAudioState();


        const text =
          state.muted

            ? 'MUTE'

            : `${Math.round(
                state.volume *
                100
              )}%`;


        /* --------------------------------------------------
           MAC LABEL
        -------------------------------------------------- */

        const screenLabel =
          document.querySelector(
            '#screenVolumeLabel'
          );


        if (screenLabel) {

          screenLabel.textContent =
            text;
        }


        /* --------------------------------------------------
           QUEST VOLUME LABEL
        -------------------------------------------------- */

        const vrVolumeLabel =
          document.querySelector(
            '#vrVolumeLabel'
          );


        if (vrVolumeLabel) {

          vrVolumeLabel
            .setAttribute(
              'value',
              text
            );
        }


        /* --------------------------------------------------
           QUEST MUTE ICON/TEXT
        -------------------------------------------------- */

        const vrMuteLabel =
          document.querySelector(
            '#vrMuteLabel'
          );


        if (vrMuteLabel) {

          vrMuteLabel
            .setAttribute(
              'value',

              state.muted
                ? 'X'
                : 'M'
            );
        }
      }
  }
);


/* ============================================================
   QUEST CAMERA-CORNER UI

   Keeps Settings and Exit icons near the
   upper corners of the player's view.

   Attach to a child of #cam.

   Example:

   camera-corner-ui="
     side: right;
     distance: 2"
============================================================ */

AFRAME.registerComponent(
  'camera-corner-ui',
  {

    schema: {

      side: {
        default:
          'right',

        oneOf: [
          'left',
          'right'
        ]
      },


      /*
        How far in front of the camera
        the icon exists.
      */
      distance: {
        default: 2
      },


      /*
        0 = exactly at outer horizontal edge.

        Higher number pulls it inward.

        0.13 = slightly away from the edge.
      */
      horizontalInset: {
        default: 0.13
      },


      /*
        Same idea vertically.

        Keeps the icon slightly below
        the very top of the view.
      */
      verticalInset: {
        default: 0.16
      }
    },


    init: function () {

      /*
        We do not need to calculate this
        every single rendered frame.
      */
      this.lastUpdate =
        0;
    },


    tick:
      function (time) {

        /*
          Update roughly every 150 ms.
        */
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
          cameraEl &&
          cameraEl.getObject3D(
            'camera'
          );


        if (!camera) {
          return;
        }


        const distance =
          this.data.distance;


        /*
          Convert camera FOV to radians.
        */
        const fov =
          THREE.MathUtils
            .degToRad(
              camera.fov ||
              60
            );


        /*
          Calculate height of the visible
          camera area at this distance.
        */
        const halfHeight =
          Math.tan(
            fov / 2
          ) *
          distance;


        /*
          Camera aspect ratio.
        */
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


        /*
          Move slightly inward from
          the horizontal edge.
        */
        const xMagnitude =
          halfWidth *
          (
            1 -
            this.data
              .horizontalInset
          );


        const x =
          this.data.side ===
            'left'

            ? -xMagnitude

            : xMagnitude;


        /*
          Position near top edge.
        */
        const y =
          halfHeight *
          (
            1 -
            this.data
              .verticalInset
          );


        /*
          Because these entities are children
          of #cam, these are camera-local
          coordinates.

          Therefore they follow the player's
          view naturally.
        */
        this.el.object3D
          .position.set(
            x,
            y,
            -distance
          );
      }
  }
);


/* ============================================================
   QUEST VR UI INTERACTION

   Uses the RIGHT CONTROLLER trigger.

   The right-hand raycaster in index.html
   includes:

   .vr-control
============================================================ */

AFRAME.registerComponent(
  'vr-ui-interactor',
  {

    init: function () {

      this.triggerHeld =
        false;


      this.onTriggerDown =
        this.onTriggerDown.bind(
          this
        );


      this.onTriggerUp =
        this.onTriggerUp.bind(
          this
        );


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


    /* ======================================================
       TRIGGER PRESSED
    ====================================================== */

    onTriggerDown:
      function () {

        /*
          Prevent one held trigger from
          repeatedly activating buttons.
        */
        if (
          this.triggerHeld
        ) {
          return;
        }


        this.triggerHeld =
          true;


        const raycaster =
          this.el.components
            .raycaster;


        if (!raycaster) {
          return;
        }


        /*
          VR UI entities can change visibility,
          so refresh raycaster objects.
        */
        if (
          raycaster.refreshObjects
        ) {

          raycaster
            .refreshObjects();
        }


        /* --------------------------------------------------
           UI ELEMENTS
        -------------------------------------------------- */

        const settingsButton =
          document.querySelector(
            '#vrSettingsButton'
          );


        const exitButton =
          document.querySelector(
            '#vrExitButton'
          );


        const panel =
          document.querySelector(
            '#vrSettingsPanel'
          );


        const volumeDown =
          document.querySelector(
            '#vrVolumeDown'
          );


        const muteButton =
          document.querySelector(
            '#vrMuteButton'
          );


        const volumeUp =
          document.querySelector(
            '#vrVolumeUp'
          );


        /*
          Helper function.

          Returns intersection information
          if the laser currently hits
          that entity.
        */
        const hit =
          (element) => {

            return (
              element &&
              raycaster.getIntersection

                ? raycaster
                    .getIntersection(
                      element
                    )

                : null
            );
          };


        /* ==================================================
           SETTINGS BUTTON
        ================================================== */

        if (
          hit(
            settingsButton
          )
        ) {

          if (panel) {

            const currentlyVisible =
              panel.getAttribute(
                'visible'
              );


            panel.setAttribute(
              'visible',
              !currentlyVisible
            );
          }


          return;
        }


        /* ==================================================
           EXIT BUTTON
        ================================================== */

        if (
          hit(
            exitButton
          )
        ) {

          exitRoomsWithin();


          return;
        }


        /* ==================================================
           SETTINGS PANEL BUTTONS

           Only respond while panel
           is actually visible.
        ================================================== */

        if (
          panel &&
          panel.getAttribute(
            'visible'
          )
        ) {


          /* ------------------------------------------------
             VOLUME DOWN
          ------------------------------------------------ */

          if (
            hit(
              volumeDown
            )
          ) {

            if (
              window
                .changeRoomsVolume
            ) {

              window
                .changeRoomsVolume(
                  -0.1
                );
            }


            return;
          }


          /* ------------------------------------------------
             MUTE / UNMUTE
          ------------------------------------------------ */

          if (
            hit(
              muteButton
            )
          ) {

            if (
              window
                .toggleRoomsMute
            ) {

              window
                .toggleRoomsMute();
            }


            return;
          }


          /* ------------------------------------------------
             VOLUME UP
          ------------------------------------------------ */

          if (
            hit(
              volumeUp
            )
          ) {

            if (
              window
                .changeRoomsVolume
            ) {

              window
                .changeRoomsVolume(
                  0.1
                );
            }


            return;
          }
        }
      },


    /* ======================================================
       TRIGGER RELEASED
    ====================================================== */

    onTriggerUp:
      function () {

        this.triggerHeld =
          false;
      }
  }
);


/* ============================================================
   TUTORIAL

   FIXED VERSION:

   The old file listened for:

   stateadded

   on #story-manager.

   That was incorrect.

   story.js now emits:

   clue-collected

   whenever the first new clue is grabbed.
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

        console.warn(
          'Tutorial could not find #story-manager.'
        );


        return;
      }


      /*
        Hide tutorial when first clue
        is successfully collected.

        once: true means this listener
        automatically removes itself
        afterwards.
      */
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
   INTRO SEQUENCE

   This remains a SAFE placeholder.

   Your group has not supplied the final:

   - intro voice file
   - fade overlay
   - exact intro timing

   So we do not invent those assets here.
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


    play: function () {

      console.log(
        'Intro sequence is ready for the final voice and fade assets.'
      );
    }
  }
);


/* ============================================================
   JUMPSCARE CONTROLLER

   Triggered by:

   story.js
       ↓
   all-clues-collected
       ↓
   jumpscare-controller
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

        console.warn(
          'Jumpscare controller could not find #story-manager.'
        );


        return;
      }


      /*
        The jumpscare should happen
        only once.
      */
      manager.addEventListener(
        'all-clues-collected',

        () => {

          this.trigger();
        },

        {
          once: true
        }
      );
    },


    /* ======================================================
       START JUMPSCARE
    ====================================================== */

    trigger: function () {

      console.log(
        'Starting jumpscare.'
      );


      /* ====================================================
         SCARE FOOTSTEPS

         IMPORTANT:

         We DO NOT use #footstepAudio.

         #footstepAudio belongs to the
         player's normal walking system.

         Instead index.html contains:

         #scareFootstepAudio

         It can use the same WAV file,
         but it is a completely separate
         audio player.
      ==================================================== */

      const scareSteps =
        document.querySelector(
          '#scareFootstepAudio'
        );


      if (scareSteps) {

        /*
          Read current master-volume
          setting from audio.js.
        */
        const audioState =
          window
            .getRoomsAudioState

            ? window
                .getRoomsAudioState()

            : {
                effectiveVolume:
                  1
              };


        /*
          Restart scare sound from beginning.
        */
        scareSteps.pause();


        scareSteps.currentTime =
          0;


        /*
          Slightly louder than player
          footsteps, but still controlled
          by master volume.
        */
        scareSteps.volume =
          Math.max(
            0,

            Math.min(
              1,

              0.35 *
              audioState
                .effectiveVolume
            )
          );


        const playPromise =
          scareSteps.play();


        if (playPromise) {

          playPromise.catch(
            (error) => {

              console.warn(
                'Scare footsteps could not start:',
                error
              );
            }
          );
        }


        /*
          Stop warning footsteps shortly
          before/around the scare appearance.
        */
        window.setTimeout(
          () => {

            scareSteps.pause();


            scareSteps.currentTime =
              0;
          },

          1800
        );
      }


      /* ====================================================
         SHOW SCARE CHARACTER

         Wait 0.5 second after the
         scare sequence starts.
      ==================================================== */

      window.setTimeout(
        () => {

          const character =
            document.querySelector(
              '#scare-character'
            );


          if (!character) {

            console.warn(
              'Jumpscare could not find #scare-character.'
            );


            return;
          }


          /*
            Character suddenly appears.
          */
          character.setAttribute(
            'visible',
            true
          );


          /* =================================================
             HIDE CHARACTER AFTER 1.8 SECONDS
          ================================================= */

          window.setTimeout(
            () => {

              character.setAttribute(
                'visible',
                false
              );


              console.log(
                'Jumpscare finished.'
              );


              /*
                FINAL STORY DOOR:

                We deliberately do NOT automatically
                open a door here yet.

                Your cua.glb may contain two
                independently controlled door leaves.

                We should first confirm which specific
                door is supposed to open after the
                final scare before connecting the
                story event to it.
              */

            },

            1800
          );
        },

        500
      );
    }
  }
);