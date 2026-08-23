/* ============================================================
   mirror.js
   ROOMS WITHIN - AUTOMATIC GLITCH MIRROR

   - No click required.
   - Walk close to the mirror -> automatic glitch.
   - Walk away -> mirror rearms for the next approach.
   - First trigger emits "mirror-inspected" for story progress.
   - After the offering, mirror keeps a haunted idle state.
   - No camera shake, so it remains more comfortable in VR.
============================================================ */

function mirrorGameplayLocked() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function mirrorWait(milliseconds) {
  if (
    window.waitRoomsMilliseconds
  ) {
    return window
      .waitRoomsMilliseconds(
        milliseconds
      );
  }

  return new Promise(
    (resolve) => {
      let remaining =
        Math.max(
          0,
          Number(
            milliseconds
          ) || 0
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

        if (
          !mirrorGameplayLocked()
        ) {
          remaining -= elapsed;
        }

        if (
          remaining <= 0
        ) {
          resolve();
          return;
        }

        requestAnimationFrame(
          step
        );
      }

      requestAnimationFrame(
        step
      );
    }
  );
}


function mirrorRandomBetween(
  min,
  max
) {
  return (
    min +
    Math.random() *
    (
      max - min
    )
  );
}


/* ============================================================
   HAUNTED MIRROR
============================================================ */

AFRAME.registerComponent(
  'haunted-mirror',
  {
    schema: {
      surface: {
        type: 'selector'
      },

      distortion: {
        type: 'selector'
      },

      postOfferingPulseSpeed: {
        default: 1.6
      },

      inspectionDuration: {
        default: 2200
      },

      /*
        Starts automatically when
        player is this close.
      */
      triggerDistance: {
        default: 1.65
      },

      /*
        Player has to back away this
        far before it can trigger again.
      */
      resetDistance: {
        default: 2.20
      },

      proximityInterval: {
        default: 90
      },

      glitchStrength: {
        default: 1.0
      }
    },


    init: function () {
      this.hasOfferingChanged =
        false;

      this.offeringChangeStarted =
        false;

      this.isGlitching =
        false;

      this.glitchElapsed =
        0;

      this.playerInside =
        false;

      this.hasReportedStoryClue =
        false;

      this.lastProximityCheck =
        0;

      this.playerWorld =
        new THREE.Vector3();

      this.mirrorWorld =
        new THREE.Vector3();

      this.baseDistortionX =
        0;

      this.baseDistortionY =
        0;

      this.baseDistortionZ =
        0;

      this.glitchBars =
        [];

      this.removed =
        false;

      this.onOfferingCompleted =
        this.onOfferingCompleted
          .bind(
            this
          );

      this.el.sceneEl
        .addEventListener(
          'offering-completed',
          this.onOfferingCompleted
        );

      if (
        this.data.distortion
      ) {
        this.baseDistortionX =
          this.data.distortion
            .object3D
            .position.x;

        this.baseDistortionY =
          this.data.distortion
            .object3D
            .position.y;

        this.baseDistortionZ =
          this.data.distortion
            .object3D
            .position.z;
      }

      this.createGlitchBars();

      this.setNormalLook();

      console.log(
        'Automatic glitch mirror ready.'
      );
    },


    /* ======================================================
       CREATE GLITCH BARS
    ====================================================== */

    createGlitchBars:
      function () {
        const colors = [
          '#f2f2f2',
          '#8f1b1b',
          '#24515a',
          '#101010',
          '#bfc8ca'
        ];

        for (
          let i = 0;
          i < 5;
          i++
        ) {
          const bar =
            document.createElement(
              'a-plane'
            );

          bar.classList.add(
            'mirror-glitch-bar'
          );

          bar.setAttribute(
            'width',
            0.55
          );

          bar.setAttribute(
            'height',
            0.025
          );

          bar.setAttribute(
            'position',
            `0 0 ${
              0.008 +
              i *
              0.0005
            }`
          );

          bar.setAttribute(
            'visible',
            false
          );

          bar.setAttribute(
            'material',
            `
              shader: flat;
              color: ${colors[i]};
              opacity: 0;
              transparent: true;
              depthWrite: false;
              depthTest: false;
              side: double
            `
          );

          this.el.appendChild(
            bar
          );

          this.glitchBars.push(
            bar
          );
        }
      },


    /* ======================================================
       NORMAL MIRROR
    ====================================================== */

    setNormalLook:
      function () {
        const surface =
          this.data.surface;

        const distortion =
          this.data.distortion;

        if (
          surface
        ) {
          surface.object3D
            .position
            .set(
              0,
              0,
              0.002
            );

          surface.object3D
            .rotation
            .set(
              0,
              0,
              0
            );

          surface.object3D
            .scale
            .set(
              1,
              1,
              1
            );

          surface.setAttribute(
            'material',
            'color',
            '#57616a'
          );

          surface.setAttribute(
            'material',
            'metalness',
            0.92
          );

          surface.setAttribute(
            'material',
            'roughness',
            0.16
          );

          surface.setAttribute(
            'material',
            'emissive',
            '#101820'
          );

          surface.setAttribute(
            'material',
            'emissiveIntensity',
            0.12
          );
        }

        if (
          distortion
        ) {
          distortion.object3D
            .position
            .set(
              this.baseDistortionX,
              this.baseDistortionY,
              this.baseDistortionZ
            );

          distortion.object3D
            .rotation
            .set(
              0,
              0,
              0
            );

          distortion.object3D
            .scale
            .set(
              1,
              1,
              1
            );

          distortion.setAttribute(
            'visible',
            false
          );

          distortion.setAttribute(
            'material',
            'color',
            '#081012'
          );

          distortion.setAttribute(
            'material',
            'opacity',
            0
          );
        }

        this.hideGlitchBars();
      },


    /* ======================================================
       HAUNTED LOOK AFTER OFFERING
    ====================================================== */

    setHauntedLook:
      function () {
        const surface =
          this.data.surface;

        const distortion =
          this.data.distortion;

        if (
          surface
        ) {
          surface.object3D
            .position
            .set(
              0,
              0,
              0.002
            );

          surface.object3D
            .rotation
            .set(
              0,
              0,
              0
            );

          surface.object3D
            .scale
            .set(
              1,
              1,
              1
            );

          surface.setAttribute(
            'material',
            'color',
            '#30383c'
          );

          surface.setAttribute(
            'material',
            'metalness',
            0.88
          );

          surface.setAttribute(
            'material',
            'roughness',
            0.24
          );

          surface.setAttribute(
            'material',
            'emissive',
            '#142022'
          );

          surface.setAttribute(
            'material',
            'emissiveIntensity',
            0.28
          );
        }

        if (
          distortion
        ) {
          distortion.object3D
            .position
            .set(
              this.baseDistortionX,
              this.baseDistortionY,
              this.baseDistortionZ
            );

          distortion.object3D
            .rotation
            .set(
              0,
              0,
              0
            );

          distortion.object3D
            .scale
            .set(
              1,
              1,
              1
            );

          distortion.setAttribute(
            'visible',
            true
          );

          distortion.setAttribute(
            'material',
            'color',
            '#0a1518'
          );

          distortion.setAttribute(
            'material',
            'opacity',
            0.055
          );
        }

        this.hideGlitchBars();
      },


    /* ======================================================
       OFFERING COMPLETED
    ====================================================== */

    onOfferingCompleted:
      async function () {
        if (
          this.offeringChangeStarted ||
          this.hasOfferingChanged
        ) {
          return;
        }

        this.offeringChangeStarted =
          true;

        await mirrorWait(
          900
        );

        if (
          this.removed ||
          !this.el.isConnected
        ) {
          return;
        }

        this.hasOfferingChanged =
          true;

        if (
          !this.isGlitching
        ) {
          this.setHauntedLook();
        }

        this.el.emit(
          'mirror-changed',
          {},
          false
        );

        this.el.sceneEl.emit(
          'mirror-changed',
          {},
          false
        );

        console.log(
          'Mirror permanently changed after offering.'
        );
      },


    /* ======================================================
       AUTOMATIC PLAYER DISTANCE CHECK
    ====================================================== */

    updateProximity:
      function (
        time
      ) {
        if (
          time -
          this.lastProximityCheck <
          this.data
            .proximityInterval
        ) {
          return;
        }

        this.lastProximityCheck =
          time;

        const camera =
          document.querySelector(
            '#cam'
          ) ||
          document.querySelector(
            '#rig'
          );

        if (
          !camera
        ) {
          return;
        }

        camera.object3D
          .getWorldPosition(
            this.playerWorld
          );

        this.el.object3D
          .getWorldPosition(
            this.mirrorWorld
          );

        const distance =
          this.playerWorld
            .distanceTo(
              this.mirrorWorld
            );

        if (
          distance <=
            this.data
              .triggerDistance &&
          !this.playerInside
        ) {
          this.playerInside =
            true;

          this.startGlitchEffect();

          return;
        }

        if (
          distance >=
            this.data
              .resetDistance
        ) {
          this.playerInside =
            false;
        }
      },


    /* ======================================================
       START CRAZY GLITCH
    ====================================================== */

    startGlitchEffect:
      function () {
        if (
          mirrorGameplayLocked() ||
          this.isGlitching
        ) {
          return false;
        }

        this.isGlitching =
          true;

        this.glitchElapsed =
          0;

        if (
          this.data.distortion
        ) {
          this.data.distortion
            .setAttribute(
              'visible',
              true
            );
        }

        /*
          Make room lights react too.
        */
        [
          '#greenRoomLight',
          '#yellowRoomLight'
        ].forEach(
          (
            selector
          ) => {
            const light =
              document.querySelector(
                selector
              );

            const flicker =
              light &&
              light.components
                ? light.components
                    .flicker
                : null;

            if (
              flicker &&
              flicker.triggerReaction
            ) {
              flicker
                .triggerReaction(
                  'chaotic'
                );
            }
          }
        );

        /*
          Automatically count mirror
          as a story clue the first time.
        */
        if (
          !this.hasReportedStoryClue
        ) {
          this.hasReportedStoryClue =
            true;

          const detail = {
            automatic:
              true,

            afterOffering:
              this.hasOfferingChanged
          };

          this.el.emit(
            'mirror-inspected',
            detail,
            false
          );

          this.el.sceneEl.emit(
            'mirror-inspected',
            detail,
            false
          );
        }

        this.el.emit(
          'mirror-glitch-started',
          {
            afterOffering:
              this.hasOfferingChanged
          },
          false
        );

        console.log(
          'Mirror proximity glitch triggered.'
        );

        return true;
      },


    /* ======================================================
       GLITCH BARS
    ====================================================== */

    hideGlitchBars:
      function () {
        this.glitchBars
          .forEach(
            (
              bar
            ) => {
              bar.setAttribute(
                'visible',
                false
              );

              bar.setAttribute(
                'material',
                'opacity',
                0
              );
            }
          );
      },


    updateGlitchBars:
      function (
        strength,
        envelope
      ) {
        this.glitchBars
          .forEach(
            (
              bar,
              index
            ) => {
              const visible =
                Math.random() <
                (
                  0.42 +
                  envelope *
                  0.40
                );

              bar.setAttribute(
                'visible',
                visible
              );

              if (
                !visible
              ) {
                return;
              }

              const x =
                mirrorRandomBetween(
                  -0.10,
                  0.10
                ) *
                strength;

              const y =
                mirrorRandomBetween(
                  -0.45,
                  0.45
                );

              const width =
                mirrorRandomBetween(
                  0.18,
                  0.66
                );

              const height =
                mirrorRandomBetween(
                  0.008,
                  0.055
                );

              bar.setAttribute(
                'position',
                `${x} ${y} ${
                  0.008 +
                  index *
                  0.0005
                }`
              );

              bar.setAttribute(
                'width',
                width
              );

              bar.setAttribute(
                'height',
                height
              );

              bar.setAttribute(
                'material',
                'opacity',
                mirrorRandomBetween(
                  0.16,
                  0.68
                ) *
                envelope
              );
            }
          );
      },


    /* ======================================================
       GLITCH ANIMATION
    ====================================================== */

    updateGlitchEffect:
      function (
        deltaTime
      ) {
        const surface =
          this.data.surface;

        const distortion =
          this.data.distortion;

        if (
          !surface ||
          !this.isGlitching
        ) {
          return;
        }

        this.glitchElapsed +=
          deltaTime;

        /*
          Even though your index currently
          says inspectionDuration: 1200,
          this guarantees at least 2.2 sec.
        */
        const duration =
          Math.max(
            2200,

            Number(
              this.data
                .inspectionDuration
            ) ||
            2200
          );

        const progress =
          THREE.MathUtils
            .clamp(
              this.glitchElapsed /
              duration,

              0,
              1
            );

        const attack =
          THREE.MathUtils
            .smoothstep(
              progress,
              0,
              0.10
            );

        const release =
          1 -
          THREE.MathUtils
            .smoothstep(
              progress,
              0.72,
              1
            );

        const envelope =
          Math.min(
            attack,
            release
          );

        /*
          After offering, make it even worse.
        */
        const afterOfferingBoost =
          this.hasOfferingChanged
            ? 1.28
            : 1;

        const strength =
          this.data
            .glitchStrength *
          afterOfferingBoost *
          envelope;


        /* ==================================================
           VIOLENT MIRROR JITTER
        ================================================== */

        const jumpX =
          mirrorRandomBetween(
            -0.028,
            0.028
          ) *
          strength;

        const jumpY =
          mirrorRandomBetween(
            -0.016,
            0.016
          ) *
          strength;

        const scaleX =
          1 +
          mirrorRandomBetween(
            -0.075,
            0.10
          ) *
          strength;

        const scaleY =
          1 +
          mirrorRandomBetween(
            -0.055,
            0.065
          ) *
          strength;

        surface.object3D
          .position
          .set(
            jumpX,
            jumpY,
            0.002
          );

        surface.object3D
          .scale
          .set(
            scaleX,
            scaleY,
            1
          );

        surface.object3D
          .rotation.z =
            THREE.MathUtils
              .degToRad(
                mirrorRandomBetween(
                  -2.3,
                  2.3
                ) *
                strength
              );


        /* ==================================================
           RANDOM RED / CYAN / WHITE FLASHES
        ================================================== */

        const flash =
          Math.random();

        if (
          flash >
          0.90
        ) {
          surface.setAttribute(
            'material',
            'color',
            '#d7d9d9'
          );

          surface.setAttribute(
            'material',
            'emissive',
            '#687579'
          );
        }

        else if (
          flash >
          0.72
        ) {
          surface.setAttribute(
            'material',
            'color',
            '#431718'
          );

          surface.setAttribute(
            'material',
            'emissive',
            '#5f1214'
          );
        }

        else if (
          flash >
          0.54
        ) {
          surface.setAttribute(
            'material',
            'color',
            '#173b42'
          );

          surface.setAttribute(
            'material',
            'emissive',
            '#163a40'
          );
        }

        else {
          surface.setAttribute(
            'material',
            'color',

            this.hasOfferingChanged
              ? '#283033'
              : '#4c555b'
          );

          surface.setAttribute(
            'material',
            'emissive',

            this.hasOfferingChanged
              ? '#142022'
              : '#101820'
          );
        }

        surface.setAttribute(
          'material',
          'emissiveIntensity',

          (
            this.hasOfferingChanged
              ? 0.30
              : 0.16
          ) +

          mirrorRandomBetween(
            0.12,
            1.15
          ) *
          envelope
        );


        /* ==================================================
           DISTORTION PLANE
        ================================================== */

        if (
          distortion
        ) {
          distortion.setAttribute(
            'visible',
            true
          );

          distortion.object3D
            .position
            .set(
              this.baseDistortionX +

              mirrorRandomBetween(
                -0.055,
                0.055
              ) *
              strength,


              this.baseDistortionY +

              mirrorRandomBetween(
                -0.035,
                0.035
              ) *
              strength,


              this.baseDistortionZ
            );

          distortion.object3D
            .scale
            .set(
              1 +

              mirrorRandomBetween(
                -0.14,
                0.16
              ) *
              strength,


              1 +

              mirrorRandomBetween(
                -0.08,
                0.10
              ) *
              strength,


              1
            );

          distortion.object3D
            .rotation.z =
              THREE.MathUtils
                .degToRad(
                  mirrorRandomBetween(
                    -3,
                    3
                  ) *
                  strength
                );

          const distortionFlash =
            Math.random();

          distortion.setAttribute(
            'material',
            'color',

            distortionFlash >
            0.72

              ? '#7b1717'

              : distortionFlash >
                0.46

                ? '#16434b'

                : '#d0d4d4'
          );

          distortion.setAttribute(
            'material',
            'opacity',

            0.04 +

            mirrorRandomBetween(
              0.04,
              0.42
            ) *
            envelope
          );
        }


        this.updateGlitchBars(
          strength,
          envelope
        );


        if (
          progress >=
          1
        ) {
          this.finishGlitchEffect();
        }
      },


    /* ======================================================
       FINISH EFFECT
    ====================================================== */

    finishGlitchEffect:
      function () {
        this.isGlitching =
          false;

        this.glitchElapsed =
          0;

        if (
          this.hasOfferingChanged
        ) {
          this.setHauntedLook();
        }

        else {
          this.setNormalLook();
        }

        this.el.emit(
          'mirror-glitch-finished',
          {},
          false
        );
      },


    /* ======================================================
       HAUNTED IDLE AFTER OFFERING
    ====================================================== */

    updateHauntedIdle:
      function (
        time
      ) {
        const distortion =
          this.data.distortion;

        if (
          !this.hasOfferingChanged ||
          this.isGlitching ||
          !distortion
        ) {
          return;
        }

        const seconds =
          time *
          0.001;

        const speed =
          this.data
            .postOfferingPulseSpeed;

        distortion.object3D
          .position.x =
            this.baseDistortionX +

            Math.sin(
              seconds *
              speed
            ) *
            0.006;

        distortion.object3D
          .position.y =
            this.baseDistortionY +

            Math.sin(
              seconds *
              1.21 *
              speed +
              1.4
            ) *
            0.004;

        distortion.setAttribute(
          'material',
          'opacity',

          0.045 +

          (
            Math.sin(
              seconds *
              speed *
              1.7
            ) +
            1
          ) *
          0.015
        );
      },


    /* ======================================================
       FRAME UPDATE
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          mirrorGameplayLocked() ||
          !deltaTime
        ) {
          return;
        }

        this.updateProximity(
          time
        );

        if (
          this.isGlitching
        ) {
          this.updateGlitchEffect(
            deltaTime
          );

          return;
        }

        this.updateHauntedIdle(
          time
        );
      },


    /* ======================================================
       CLEANUP
    ====================================================== */

    remove:
      function () {
        this.removed =
          true;

        this.el.sceneEl
          .removeEventListener(
            'offering-completed',
            this.onOfferingCompleted
          );

        this.hideGlitchBars();

        this.glitchBars
          .forEach(
            (
              bar
            ) => {
              if (
                bar.parentNode
              ) {
                bar.parentNode
                  .removeChild(
                    bar
                  );
              }
            }
          );

        this.glitchBars =
          [];
      }
  }
);


/* ============================================================
   QUEST COMPATIBILITY

   index.html still contains vr-mirror-interactor.

   We keep the component registered, but it does nothing now
   because the mirror is completely automatic.
============================================================ */

AFRAME.registerComponent(
  'vr-mirror-interactor',
  {
    init: function () {
      /*
        Intentionally empty.
      */
    }
  }
);


/* ============================================================
   DEBUG
============================================================ */

window.getRoomsMirrorDebug =
  function () {
    const mirror =
      document.querySelector(
        '#mirror'
      );

    const component =
      mirror &&
      mirror.components

        ? mirror.components[
            'haunted-mirror'
          ]

        : null;

    if (
      !component
    ) {
      return {
        ready:
          false
      };
    }

    return {
      ready:
        true,

      automatic:
        true,

      triggerDistance:
        component.data
          .triggerDistance,

      resetDistance:
        component.data
          .resetDistance,

      playerInside:
        component
          .playerInside,

      glitching:
        component
          .isGlitching,

      storyClueReported:
        component
          .hasReportedStoryClue,

      afterOffering:
        component
          .hasOfferingChanged
    };
  };