/* ============================================================
   engine-environment.js — ROOMS WITHIN
   FULL REPLACEMENT

   Environment + movement + collision + comfort + performance.

   Main goals:
   - Irregular horror-light flicker.
   - Automatic proximity light reaction.
   - Invisible teleport floor generation from named Blender floors.
   - Player collision with sliding.
   - Desktop head bob only.
   - REAL immersive XR uses teleport instead of smooth locomotion.
   - Requests 90 Hz when the active WebXR session supports it.
   - Measures approximate rendered FPS for testing/debugging.
   - Pause-aware environment systems.
============================================================ */


/* ============================================================
   SHARED HELPERS
============================================================ */

function roomsEnvironmentPaused() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function roomsEnvironmentIsImmersiveXR(scene) {
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
    return false;
  }
}


/* ============================================================
   IRREGULAR HORROR FLICKER
============================================================ */

/* ============================================================
   DARK HORROR FLICKER + THUNDER
============================================================ */

AFRAME.registerComponent(
  'flicker',
  {
    schema: {
      min: {
        default: 0.8
      },

      max: {
        default: 1.2
      },

      speed: {
        default: 0.5
      }
    },


    init: function () {
      const light =
        this.el.getAttribute(
          'light'
        ) || {};


      const originalIntensity =
        typeof light.intensity ===
        'number'

          ? light.intensity

          : this.data.max;


      /*
        Stable brightness.

        min/max still determine the
        normal resting range.

        Flicker dips are now allowed
        BELOW min.
      */

      this.stableIntensity =
        THREE.MathUtils.clamp(
          originalIntensity,

          Math.min(
            this.data.min,
            this.data.max
          ),

          Math.max(
            this.data.min,
            this.data.max
          )
        );


      this.sequence =
        [];


      this.sequenceIndex =
        0;


      this.stepRemaining =
        0;


      this.nextEventRemaining =
        this.randomEventDelay();


      this.componentPaused =
        false;


      this.applyIntensity(
        this.stableIntensity
      );
    },


    /* ======================================================
       RANDOM
    ====================================================== */

    randomBetween:
      function (
        minimum,
        maximum
      ) {
        return (
          minimum +
          Math.random() *
          (
            maximum -
            minimum
          )
        );
      },


    randomEventDelay:
      function () {
        const speed =
          THREE.MathUtils.clamp(
            Number(
              this.data.speed
            ) || 0.5,

            0.1,
            1.5
          );


        const frequencyScale =
          THREE.MathUtils.clamp(
            0.55 / speed,

            0.72,
            1.35
          );


        return (
          this.randomBetween(
            3000,
            11000
          ) *
          frequencyScale
        );
      },


    /* ======================================================
       LIGHT INTENSITY
    ====================================================== */

    applyIntensity:
      function (
        value
      ) {
        this.el.setAttribute(
          'light',
          'intensity',

          Math.max(
            0,
            value
          )
        );
      },


    /*
      IMPORTANT:

      Unlike the old version,
      this does NOT clamp to data.min.

      Therefore a light at intensity 8
      can suddenly drop near 0.5.
    */

    darkDip:
      function (
        minimum,
        maximum
      ) {
        return (
          this.stableIntensity *
          this.randomBetween(
            minimum,
            maximum
          )
        );
      },


    /* ======================================================
       SINGLE FLICKER
    ====================================================== */

    buildSingleFlicker:
      function () {
        return [
          {
            intensity:
              this.darkDip(
                0.12,
                0.28
              ),

            duration:
              this.randomBetween(
                70,
                130
              )
          },

          {
            intensity:
              this.stableIntensity,

            duration:
              this.randomBetween(
                100,
                180
              )
          }
        ];
      },


    /* ======================================================
       DOUBLE FLICKER
    ====================================================== */

    buildDoubleFlicker:
      function () {
        return [
          {
            intensity:
              this.darkDip(
                0.08,
                0.22
              ),

            duration:
              this.randomBetween(
                65,
                120
              )
          },

          {
            intensity:
              this.stableIntensity,

            duration:
              this.randomBetween(
                45,
                100
              )
          },

          {
            intensity:
              this.darkDip(
                0.04,
                0.16
              ),

            duration:
              this.randomBetween(
                80,
                150
              )
          },

          {
            intensity:
              this.stableIntensity,

            duration:
              this.randomBetween(
                120,
                220
              )
          }
        ];
      },


    /* ======================================================
       CHAOTIC FLICKER
    ====================================================== */

    buildChaoticFlicker:
      function () {
        const steps =
          [];


        const count =
          Math.floor(
            this.randomBetween(
              6,
              11
            )
          );


        for (
          let i = 0;
          i < count;
          i++
        ) {
          /*
            Occasionally flash back to
            full brightness.

            Most flashes are VERY dark.
          */

          const fullFlash =
            Math.random() <
            0.25;


          steps.push(
            {
              intensity:
                fullFlash

                  ? this
                      .stableIntensity

                  : this.darkDip(
                      0.03,
                      0.32
                    ),

              duration:
                this.randomBetween(
                  35,
                  100
                )
            }
          );
        }


        steps.push(
          {
            intensity:
              this.stableIntensity,

            duration:
              this.randomBetween(
                150,
                260
              )
          }
        );


        return steps;
      },


    /* ======================================================
       NEAR BLACKOUT
    ====================================================== */

    buildNearBlackout:
      function () {
        return [
          {
            intensity:
              this.darkDip(
                0.10,
                0.20
              ),

            duration:
              this.randomBetween(
                70,
                120
              )
          },

          {
            /*
              Nearly completely black.
            */

            intensity:
              this.stableIntensity *
              this.randomBetween(
                0.002,
                0.018
              ),

            duration:
              this.randomBetween(
                180,
                380
              )
          },

          {
            intensity:
              this.darkDip(
                0.08,
                0.20
              ),

            duration:
              this.randomBetween(
                50,
                100
              )
          },

          {
            intensity:
              this.stableIntensity,

            duration:
              this.randomBetween(
                180,
                320
              )
          }
        ];
      },


    /* ======================================================
       THUNDER

       Plays ONCE when a flicker sequence starts.

       It first checks window.playRoomsThunder(),
       which we can connect to audio.js.

       It also supports an existing
       <audio id="thunderAudio"> element.
    ====================================================== */

    playThunder:
      function () {
        if (
          roomsEnvironmentPaused()
        ) {
          return;
        }


        /*
          Preferred audio.js method.
        */

        if (
          typeof window
            .playRoomsThunder ===
          'function'
        ) {
          window
            .playRoomsThunder();

          return;
        }


        /*
          Fallback if you've already put
          thunderAudio in index.html.
        */

        const thunder =
          document.querySelector(
            '#thunderAudio'
          );


        if (
          !thunder
        ) {
          return;
        }


        const audioState =
          window
            .getRoomsAudioState

            ? window
                .getRoomsAudioState()

            : {
                muted:
                  false,

                volume:
                  1
              };


        if (
          audioState.muted
        ) {
          return;
        }


        thunder.pause();


        thunder.currentTime =
          0;


        /*
          Thunder should be noticeable
          but not deafening.
        */

        thunder.volume =
          Math.min(
            1,

            0.55 *
            (
              audioState.volume !==
              undefined

                ? audioState.volume

                : 1
            )
          );


        thunder
          .play()
          .catch(
            (error) => {
              console.warn(
                'Thunder could not play:',
                error
              );
            }
          );
      },


    /* ======================================================
       RANDOM EVENT
    ====================================================== */

    beginRandomEvent:
      function () {
        const roll =
          Math.random();


        if (
          roll < 0.48
        ) {
          this.sequence =
            this
              .buildSingleFlicker();
        }

        else if (
          roll < 0.76
        ) {
          this.sequence =
            this
              .buildDoubleFlicker();
        }

        else if (
          roll < 0.93
        ) {
          this.sequence =
            this
              .buildChaoticFlicker();
        }

        else {
          this.sequence =
            this
              .buildNearBlackout();
        }


        /*
          Thunder happens when the
          flicker STARTS.
        */

        this.playThunder();


        this.sequenceIndex =
          0;


        this.startCurrentStep();
      },


    /* ======================================================
       CURRENT STEP
    ====================================================== */

    startCurrentStep:
      function () {
        if (
          !this.sequence ||
          this.sequenceIndex >=
            this.sequence.length
        ) {
          this.sequence =
            [];


          this.sequenceIndex =
            0;


          this.stepRemaining =
            0;


          this.applyIntensity(
            this.stableIntensity
          );


          this.nextEventRemaining =
            this.randomEventDelay();


          return;
        }


        const step =
          this.sequence[
            this.sequenceIndex
          ];


        this.applyIntensity(
          step.intensity
        );


        this.stepRemaining =
          Math.max(
            1,
            step.duration
          );
      },


    /* ======================================================
       UPDATE
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime ||
          this.componentPaused ||
          roomsEnvironmentPaused()
        ) {
          return;
        }


        if (
          this.sequence.length
        ) {
          this.stepRemaining -=
            deltaTime;


          if (
            this.stepRemaining <= 0
          ) {
            this.sequenceIndex +=
              1;


            this.startCurrentStep();
          }


          return;
        }


        this.nextEventRemaining -=
          deltaTime;


        if (
          this.nextEventRemaining <=
          0
        ) {
          this.beginRandomEvent();
        }
      },


    /* ======================================================
       MANUAL REACTION

       Mirror/proximity effects use this.

       Thunder also plays for these.
    ====================================================== */

    triggerReaction:
      function (
        kind
      ) {
        if (
          this.componentPaused ||
          roomsEnvironmentPaused()
        ) {
          return false;
        }


        if (
          kind ===
          'single'
        ) {
          this.sequence =
            this
              .buildSingleFlicker();
        }

        else if (
          kind ===
          'chaotic'
        ) {
          this.sequence =
            this
              .buildChaoticFlicker();
        }

        else if (
          kind ===
          'blackout'
        ) {
          this.sequence =
            this
              .buildNearBlackout();
        }

        else {
          this.sequence =
            this
              .buildDoubleFlicker();
        }


        /*
          Thunder also happens when
          another system forces a flicker.
        */

        this.playThunder();


        this.sequenceIndex =
          0;


        this.startCurrentStep();


        return true;
      },


    /* ======================================================
       PAUSE
    ====================================================== */

    pause:
      function () {
        this.componentPaused =
          true;
      },


    play:
      function () {
        this.componentPaused =
          false;
      },


    remove:
      function () {
        this.applyIntensity(
          this.stableIntensity
        );
      }
  }
);


/* ============================================================
   MODEL LOAD STATUS
============================================================ */

AFRAME.registerComponent(
  'model-status',
  {
    schema: {
      name: {
        default:
          '3D model'
      }
    },


    init: function () {
      this.onModelLoaded =
        this.onModelLoaded
          .bind(this);

      this.onModelError =
        this.onModelError
          .bind(this);

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.el.addEventListener(
        'model-error',
        this.onModelError
      );
    },


    onModelLoaded:
      function () {
        console.log(
          `${this.data.name} loaded successfully.`
        );

        const root =
          this.el.getObject3D(
            'mesh'
          );

        if (!root) {
          return;
        }

        root.updateMatrixWorld(
          true
        );

        const box =
          new THREE.Box3()
            .setFromObject(
              root
            );

        if (
          box.isEmpty()
        ) {
          return;
        }

        const center =
          box.getCenter(
            new THREE.Vector3()
          );

        console.log(
          `  -> ${this.data.name} world bounding box center:`,

          center
            .toArray()
            .map(
              (number) =>
                number.toFixed(
                  2
                )
            )
        );
      },


    onModelError:
      function (event) {
        console.error(
          `${this.data.name} failed to load.`,

          event.detail
        );
      },


    remove: function () {
      this.el.removeEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.el.removeEventListener(
        'model-error',
        this.onModelError
      );
    }
  }
);


/* ============================================================
   CREATE TELEPORT FLOORS FROM NAMED BLENDER OBJECTS
============================================================ */

AFRAME.registerComponent(
  'tag-floors',
  {
    schema: {
      floorNames: {
        type:
          'array',

        default: [
          'san nha phong khach',
          'san nha phong an',
          'san nha TOILET',
          'san giat do',
          'SAN PHONG NGU'
        ]
      }
    },


    init: function () {
      this.generatedPlanes =
        [];

      this.onModelLoaded =
        this.onModelLoaded
          .bind(this);

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      if (
        this.el.getObject3D(
          'mesh'
        )
      ) {
        this.onModelLoaded();
      }
    },


    getContainer:
      function () {
        let container =
          document.querySelector(
            '#generated-teleport-floors'
          );

        if (!container) {
          container =
            document.createElement(
              'a-entity'
            );

          container.setAttribute(
            'id',
            'generated-teleport-floors'
          );

          this.el.sceneEl
            .appendChild(
              container
            );
        }

        return container;
      },


    clearGeneratedPlanes:
      function () {
        this.generatedPlanes
          .forEach(
            (plane) => {
              if (
                plane &&
                plane.parentNode
              ) {
                plane
                  .parentNode
                  .removeChild(
                    plane
                  );
              }
            }
          );

        this.generatedPlanes =
          [];
      },


    onModelLoaded:
      function () {
        const root =
          this.el.getObject3D(
            'mesh'
          );

        if (!root) {
          return;
        }

        this.clearGeneratedPlanes();

        root.updateMatrixWorld(
          true
        );

        const container =
          this.getContainer();

        let createdCount =
          0;

        this.data.floorNames
          .forEach(
            (name) => {
              const object =
                root.getObjectByName(
                  name
                );

              if (!object) {
                return;
              }

              object.updateMatrixWorld(
                true
              );

              const box =
                new THREE.Box3()
                  .setFromObject(
                    object
                  );

              if (
                box.isEmpty()
              ) {
                return;
              }

              const size =
                box.getSize(
                  new THREE.Vector3()
                );

              const center =
                box.getCenter(
                  new THREE.Vector3()
                );

              const plane =
                document
                  .createElement(
                    'a-plane'
                  );

              plane.classList.add(
                'floor'
              );

              plane.setAttribute(
                'rotation',
                '-90 0 0'
              );

              plane.setAttribute(
                'width',
                Math.max(
                  size.x,
                  0.1
                )
              );

              plane.setAttribute(
                'height',
                Math.max(
                  size.z,
                  0.1
                )
              );

              plane.setAttribute(
                'position',
                `${center.x} ${box.min.y + 0.02} ${center.z}`
              );

              /*
                Invisible, but still raycastable by blink-controls.
              */

              plane.setAttribute(
                'material',

                `
                  opacity: 0;
                  transparent: true;
                  depthWrite: false;
                  side: double
                `
              );

              container
                .appendChild(
                  plane
                );

              this.generatedPlanes
                .push(
                  plane
                );

              createdCount +=
                1;
            }
          );

        if (
          createdCount > 0
        ) {
          console.log(
            `Teleport floors generated: ${createdCount}.`
          );
        } else {
          console.warn(
            `No named teleport floor was found inside ${this.el.id || 'a room model'}. Check the Blender floor object names if teleport has no target.`
          );
        }
      },


    remove: function () {
      this.el.removeEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.clearGeneratedPlanes();
    }
  }
);


/* ============================================================
   QUEST / PLAYER ROOM COLLIDER
============================================================ */

AFRAME.registerComponent(
  'quest-room-collider',
  {
    schema: {
      objects: {
        default:
          '[gltf-model]'
      },

      radius: {
        default:
          0.32
      },

      skin: {
        default:
          0.035
      },

      maxSubstep: {
        default:
          0.12
      },

      teleportDistance: {
        default:
          0.75
      }
    },


    init: function () {
      this.colliderMeshes =
        [];

      this.lastPosition =
        this.el.object3D
          .position
          .clone();

      this.raycaster =
        new THREE.Raycaster();

      this.from =
        new THREE.Vector3();

      this.to =
        new THREE.Vector3();

      this.delta =
        new THREE.Vector3();

      this.direction =
        new THREE.Vector3();

      this.side =
        new THREE.Vector3();

      this.origin =
        new THREE.Vector3();

      this.safePosition =
        new THREE.Vector3();

      this.step =
        new THREE.Vector3();

      this.testPosition =
        new THREE.Vector3();

      this.componentPaused =
        false;

      this.modelListeners =
        [];

      this.refreshColliders =
        this.refreshColliders
          .bind(this);

      this.resetPosition =
        this.resetPosition
          .bind(this);


      this.el.sceneEl
        .addEventListener(
          'loaded',

          this.refreshColliders
        );


      this.el.sceneEl
        .addEventListener(
          'enter-vr',

          this.resetPosition
        );


      this.el.sceneEl
        .addEventListener(
          'exit-vr',

          this.resetPosition
        );


      this.el.sceneEl
        .querySelectorAll(
          this.data.objects
        )
        .forEach(
          (entity) => {
            const handler =
              this.refreshColliders;

            entity.addEventListener(
              'model-loaded',
              handler
            );

            this.modelListeners
              .push({
                entity,
                handler
              });
          }
        );


      window.setTimeout(
        this.refreshColliders,
        1000
      );
    },


    resetPosition:
      function () {
        this.lastPosition
          .copy(
            this.el.object3D
              .position
          );
      },


    refreshColliders:
      function () {
        const meshes =
          [];

        this.el.sceneEl
          .querySelectorAll(
            this.data.objects
          )
          .forEach(
            (entity) => {
              const root =
                entity.getObject3D(
                  'mesh'
                );

              if (!root) {
                return;
              }

              root.traverse(
                (node) => {
                  if (
                    node.isMesh &&
                    node.geometry &&
                    node.visible
                  ) {
                    node.userData
                      .collisionEntity =
                      entity;

                    meshes.push(
                      node
                    );
                  }
                }
              );
            }
          );

        this.colliderMeshes =
          meshes;

        console.log(
          `Player collision loaded ${meshes.length} mesh collider(s).`
        );
      },


    isBlocked: function (
      from,
      to
    ) {
      if (
        !this.colliderMeshes.length
      ) {
        return false;
      }

      this.delta.subVectors(
        to,
        from
      );

      this.delta.y =
        0;

      const distance =
        this.delta.length();

      if (
        distance <
        0.0001
      ) {
        return false;
      }

      this.direction
        .copy(
          this.delta
        )
        .normalize();

      this.side.set(
        -this.direction.z,

        0,

        this.direction.x
      );

      const heights = [
        0.22,
        0.85,
        1.42
      ];

      const sideOffsets = [
        -this.data.radius *
        0.72,

        0,

        this.data.radius *
        0.72
      ];

      const rayLength =
        distance +
        this.data.radius +
        this.data.skin;


      for (
        let heightIndex = 0;

        heightIndex <
        heights.length;

        heightIndex++
      ) {
        for (
          let sideIndex = 0;

          sideIndex <
          sideOffsets.length;

          sideIndex++
        ) {
          this.origin
            .copy(
              from
            )
            .addScaledVector(
              this.side,

              sideOffsets[
                sideIndex
              ]
            );

          this.origin.y +=
            heights[
              heightIndex
            ];

          this.origin
            .addScaledVector(
              this.direction,

              0.004
            );

          this.raycaster.set(
            this.origin,
            this.direction
          );

          this.raycaster.near =
            0;

          this.raycaster.far =
            rayLength;

          const hits =
            this.raycaster
              .intersectObjects(
                this.colliderMeshes,

                false
              );

          const blockingHit =
            hits.find(
              (hit) => {
                const owner =
                  hit.object &&
                  hit.object
                    .userData
                    ? hit.object
                      .userData
                      .collisionEntity
                    : null;

                /*
                  Held props cannot behave like walls.
                */

                if (
                  owner &&
                  owner.is &&
                  owner.is(
                    'grabbed'
                  )
                ) {
                  return false;
                }

                return (
                  hit.distance <=
                  rayLength
                );
              }
            );

          if (
            blockingHit
          ) {
            return true;
          }
        }
      }

      return false;
    },


    moveWithSliding:
      function (
        start,
        desired
      ) {
        this.delta.subVectors(
          desired,
          start
        );

        this.delta.y =
          0;

        const distance =
          this.delta.length();

        if (
          distance <
          0.0001
        ) {
          this.safePosition
            .copy(
              desired
            );

          return this
            .safePosition;
        }

        const steps =
          Math.max(
            1,

            Math.ceil(
              distance /
              this.data
                .maxSubstep
            )
          );

        this.step
          .copy(
            this.delta
          )
          .divideScalar(
            steps
          );

        this.safePosition
          .copy(
            start
          );


        for (
          let index = 0;

          index < steps;

          index++
        ) {
          this.testPosition
            .copy(
              this.safePosition
            )
            .add(
              this.step
            );

          if (
            !this.isBlocked(
              this.safePosition,

              this.testPosition
            )
          ) {
            this.safePosition
              .copy(
                this.testPosition
              );

            continue;
          }


          /*
            Try X by itself.
          */

          if (
            Math.abs(
              this.step.x
            ) >
            0.0001
          ) {
            this.testPosition
              .copy(
                this.safePosition
              );

            this.testPosition.x +=
              this.step.x;

            if (
              !this.isBlocked(
                this.safePosition,

                this.testPosition
              )
            ) {
              this.safePosition.x =
                this.testPosition.x;
            }
          }


          /*
            Try Z by itself.
          */

          if (
            Math.abs(
              this.step.z
            ) >
            0.0001
          ) {
            this.testPosition
              .copy(
                this.safePosition
              );

            this.testPosition.z +=
              this.step.z;

            if (
              !this.isBlocked(
                this.safePosition,

                this.testPosition
              )
            ) {
              this.safePosition.z =
                this.testPosition.z;
            }
          }
        }

        this.safePosition.y =
          desired.y;

        return this
          .safePosition;
      },


    tick: function () {
      if (
        this.componentPaused ||
        roomsEnvironmentPaused()
      ) {
        return;
      }

      const current =
        this.el.object3D
          .position;

      this.from.copy(
        this.lastPosition
      );

      this.to.copy(
        current
      );

      const horizontalDistance =
        Math.hypot(
          this.to.x -
          this.from.x,

          this.to.z -
          this.from.z
        );


      /*
        Large jumps are treated as a teleport.

        The collider should not test all the walls between
        the old teleport position and the new teleport position.
      */

      if (
        horizontalDistance >
        this.data
          .teleportDistance
      ) {
        this.lastPosition
          .copy(
            current
          );

        return;
      }


      if (
        horizontalDistance <
        0.0001
      ) {
        this.lastPosition.y =
          current.y;

        return;
      }


      const corrected =
        this.moveWithSliding(
          this.from,
          this.to
        );


      current.x =
        corrected.x;

      current.z =
        corrected.z;


      this.lastPosition.set(
        corrected.x,

        current.y,

        corrected.z
      );
    },


    pause: function () {
      this.componentPaused =
        true;
    },


    play: function () {
      this.componentPaused =
        false;

      this.resetPosition();
    },


    remove: function () {
      this.el.sceneEl
        .removeEventListener(
          'loaded',

          this.refreshColliders
        );


      this.el.sceneEl
        .removeEventListener(
          'enter-vr',

          this.resetPosition
        );


      this.el.sceneEl
        .removeEventListener(
          'exit-vr',

          this.resetPosition
        );


      this.modelListeners
        .forEach(
          ({
            entity,
            handler
          }) => {
            entity
              .removeEventListener(
                'model-loaded',

                handler
              );
          }
        );


      this.modelListeners =
        [];
    }
  }
);


/* ============================================================
   HEAD BOB

   Desktop:
   - subtle artificial sway.

   Real immersive VR:
   - ZERO artificial sway.
============================================================ */

AFRAME.registerComponent(
  'head-bob',
  {
    schema: {
      verticalAmount: {
        default:
          0.026
      },

      sideAmount: {
        default:
          0.014
      },

      speed: {
        default:
          8.5
      },

      /*
        Kept because index.html currently contains this value.

        Actual Quest VR does not use artificial bob at all.
      */

      vrMultiplier: {
        default:
          0.3
      }
    },


    init: function () {
      this.baseX =
        this.el.object3D
          .position.x;

      this.baseY =
        this.el.object3D
          .position.y;

      this.phase =
        0;

      this.rig =
        document.querySelector(
          '#rig'
        );

      this.previousRigPosition =
        new THREE.Vector3();

      this.currentRigPosition =
        new THREE.Vector3();

      this.componentPaused =
        false;

      this.wasImmersive =
        false;

      if (
        this.rig
      ) {
        this.resetMovementSample();
      }
    },


    resetMovementSample:
      function () {
        if (
          !this.rig
        ) {
          return;
        }

        this.rig.object3D
          .getWorldPosition(
            this.previousRigPosition
          );
      },


    restoreBasePosition:
      function () {
        this.el.object3D
          .position.x =
          this.baseX;

        this.el.object3D
          .position.y =
          this.baseY;
      },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !deltaTime ||
        !this.rig ||
        this.componentPaused ||
        roomsEnvironmentPaused()
      ) {
        return;
      }


      this.rig.object3D
        .getWorldPosition(
          this.currentRigPosition
        );


      const immersiveXR =
        roomsEnvironmentIsImmersiveXR(
          this.el.sceneEl
        );


      /*
        If real VR starts, remove any leftover desktop
        head-bob offset once.

        After that, leave headset tracking completely alone.
      */

      if (
        immersiveXR
      ) {
        if (
          !this.wasImmersive
        ) {
          this.restoreBasePosition();

          this.wasImmersive =
            true;
        }

        this.previousRigPosition
          .copy(
            this.currentRigPosition
          );

        return;
      }


      if (
        this.wasImmersive
      ) {
        this.wasImmersive =
          false;

        this.restoreBasePosition();

        this.resetMovementSample();
      }


      const deltaX =
        this.currentRigPosition.x -
        this.previousRigPosition.x;


      const deltaZ =
        this.currentRigPosition.z -
        this.previousRigPosition.z;


      const distance =
        Math.hypot(
          deltaX,
          deltaZ
        );


      const isWalking =
        distance >
        0.0001 &&
        distance <
        0.5;


      if (
        isWalking
      ) {
        this.phase +=
          deltaTime *
          0.001 *
          this.data.speed;


        const targetX =
          this.baseX +
          Math.sin(
            this.phase
          ) *
          this.data
            .sideAmount;


        const targetY =
          this.baseY +
          Math.sin(
            this.phase *
            2
          ) *
          this.data
            .verticalAmount;


        this.el.object3D
          .position.x =
          THREE.MathUtils
            .lerp(
              this.el.object3D
                .position.x,

              targetX,

              0.32
            );


        this.el.object3D
          .position.y =
          THREE.MathUtils
            .lerp(
              this.el.object3D
                .position.y,

              targetY,

              0.32
            );

      } else {
        this.el.object3D
          .position.x =
          THREE.MathUtils
            .lerp(
              this.el.object3D
                .position.x,

              this.baseX,

              0.14
            );


        this.el.object3D
          .position.y =
          THREE.MathUtils
            .lerp(
              this.el.object3D
                .position.y,

              this.baseY,

              0.14
            );
      }


      this.previousRigPosition
        .copy(
          this.currentRigPosition
        );
    },


    pause: function () {
      this.componentPaused =
        true;
    },


    play: function () {
      this.componentPaused =
        false;

      this.resetMovementSample();
    },


    remove: function () {
      this.restoreBasePosition();
    }
  }
);


/* ============================================================
   PROXIMITY LIGHT REACTION

   Professor feedback:
   - Automatic interaction
   - Visual effect like a light bulb

   Walking or teleporting close to the room light triggers
   a deliberate double flicker.
============================================================ */

AFRAME.registerComponent(
  'proximity-light-reaction',
  {
    schema: {
      enterDistance: {
        default:
          1.85
      },

      exitDistance: {
        default:
          2.35
      },

      interval: {
        default:
          180
      },

      cooldown: {
        default:
          9000
      }
    },


    init: function () {
      this.playerWasNear =
        false;

      this.lastCheck =
        0;

      this.lastReaction =
        -Infinity;

      this.playerWorld =
        new THREE.Vector3();

      this.lightWorld =
        new THREE.Vector3();
    },


    tick: function (
      time
    ) {
      if (
        roomsEnvironmentPaused() ||

        time -
        this.lastCheck <
        this.data.interval
      ) {
        return;
      }


      this.lastCheck =
        time;


      const camera =
        document.querySelector(
          '#cam'
        ) ||
        document.querySelector(
          '[camera]'
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
          this.lightWorld
        );


      /*
        Ignore Y distance because the light is above the player.
      */

      const distance =
        Math.hypot(
          this.playerWorld.x -
          this.lightWorld.x,

          this.playerWorld.z -
          this.lightWorld.z
        );


      if (
        distance <=
        this.data
          .enterDistance &&

        !this.playerWasNear
      ) {
        this.playerWasNear =
          true;


        if (
          time -
          this.lastReaction >=
          this.data.cooldown
        ) {
          this.lastReaction =
            time;


          const flicker =
            this.el.components
              .flicker;


          if (
            flicker &&
            flicker.triggerReaction
          ) {
            flicker
              .triggerReaction(
                'double'
              );
          }


          this.el.sceneEl
            .emit(
              'light-proximity-reaction',

              {
                light:
                  this.el.id ||
                  '',

                distance
              },

              false
            );
        }

        return;
      }


      if (
        distance >=
        this.data
          .exitDistance
      ) {
        this.playerWasNear =
          false;
      }
    }
  }
);


/* ============================================================
   VR COMFORT MODE

   Professor feedback:
   "Teleport to remove the motion sickness"

   REAL immersive Quest/WebXR:
   - smooth movement OFF
   - left controller teleport ON
   - head bob OFF separately

   Desktop:
   - smooth movement remains available
============================================================ */

AFRAME.registerComponent(
  'vr-comfort-mode',
  {
    init: function () {
      this.rig =
        null;

      this.leftHand =
        null;

      this.savedMovementEnabled =
        true;

      this.isComfortActive =
        false;


      this.onEnterVR =
        this.onEnterVR
          .bind(this);


      this.onExitVR =
        this.onExitVR
          .bind(this);


      this.onPauseChanged =
        this.onPauseChanged
          .bind(this);


      this.applyComfortMode =
        this.applyComfortMode
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
        'rooms-pause-changed',

        this.onPauseChanged
      );
    },


    getRig: function () {
      if (
        this.rig &&
        this.rig.isConnected
      ) {
        return this.rig;
      }

      this.rig =
        document.querySelector(
          '#rig'
        );

      return this.rig;
    },


    getLeftHand:
      function () {
        if (
          this.leftHand &&
          this.leftHand
            .isConnected
        ) {
          return this.leftHand;
        }

        this.leftHand =
          document.querySelector(
            '#leftHand'
          );

        return this.leftHand;
      },


    applyComfortMode:
      function () {
        if (
          !roomsEnvironmentIsImmersiveXR(
            this.el
          )
        ) {
          return false;
        }


        const rig =
          this.getRig();


        if (
          !rig
        ) {
          return false;
        }


        if (
          !this.isComfortActive
        ) {
          const movementData =
            rig.getAttribute(
              'movement-controls'
            ) || {};


          this.savedMovementEnabled =
            movementData.enabled !==
            false;
        }


        /*
          Absolutely prevent smooth locomotion in real Quest VR.
        */

        rig.setAttribute(
          'movement-controls',

          'enabled',

          false
        );


        const leftHand =
          this.getLeftHand();


        if (
          leftHand
        ) {
          leftHand.setAttribute(
            'blink-controls',

            'enabled',

            !roomsEnvironmentPaused()
          );
        }


        const wasActive =
          this.isComfortActive;


        this.isComfortActive =
          true;


        if (
          !wasActive
        ) {
          console.log(
            'VR comfort mode: smooth locomotion OFF. Use left-controller teleport.'
          );


          this.el.emit(
            'vr-comfort-mode-changed',

            {
              enabled:
                true
            },

            false
          );
        }


        return true;
      },


    onEnterVR:
      function () {
        /*
          A-Frame can emit enter-vr before WebXR is fully active.

          Re-check a few times.
        */

        window
          .requestAnimationFrame(
            this.applyComfortMode
          );


        window.setTimeout(
          this.applyComfortMode,

          80
        );


        window.setTimeout(
          this.applyComfortMode,

          250
        );


        window.setTimeout(
          this.applyComfortMode,

          600
        );
      },


    onPauseChanged:
      function (event) {
        if (
          !roomsEnvironmentIsImmersiveXR(
            this.el
          )
        ) {
          return;
        }


        const rig =
          this.getRig();


        if (
          rig
        ) {
          /*
            This prevents smooth locomotion from accidentally
            returning after ui-scare resumes the game.
          */

          rig.setAttribute(
            'movement-controls',

            'enabled',

            false
          );
        }


        const leftHand =
          this.getLeftHand();


        if (
          leftHand
        ) {
          const paused =
            event &&
            event.detail
              ? Boolean(
                event.detail.paused
              )
              : roomsEnvironmentPaused();


          leftHand.setAttribute(
            'blink-controls',

            'enabled',

            !paused
          );
        }
      },


    onExitVR:
      function () {
        if (
          !this.isComfortActive
        ) {
          return;
        }


        const rig =
          this.getRig();


        if (
          rig
        ) {
          rig.setAttribute(
            'movement-controls',

            'enabled',

            this.savedMovementEnabled
          );
        }


        const leftHand =
          this.getLeftHand();


        if (
          leftHand
        ) {
          leftHand.setAttribute(
            'blink-controls',

            'enabled',

            true
          );
        }


        this.isComfortActive =
          false;


        console.log(
          'VR comfort mode: desktop movement restored.'
        );


        this.el.emit(
          'vr-comfort-mode-changed',

          {
            enabled:
              false
          },

          false
        );
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
        'rooms-pause-changed',

        this.onPauseChanged
      );


      this.onExitVR();
    }
  }
);


/* ============================================================
   WEBXR 90 HZ REQUEST

   IMPORTANT:

   Requesting 90 Hz does NOT guarantee rendering at 90 FPS.

   This asks Quest/WebXR to use a 90 Hz display target if the
   current headset/browser exposes 90 Hz as supported.
============================================================ */

AFRAME.registerComponent(
  'vr-refresh-rate-manager',
  {
    init: function () {
      this.targetRate =
        null;

      this.supportedRates =
        [];

      this.lastStatus =
        'not-in-xr';


      this.onEnterVR =
        this.onEnterVR
          .bind(this);


      this.onExitVR =
        this.onExitVR
          .bind(this);


      this.requestNinetyHz =
        this.requestNinetyHz
          .bind(this);


      this.el.addEventListener(
        'enter-vr',

        this.onEnterVR
      );


      this.el.addEventListener(
        'exit-vr',

        this.onExitVR
      );
    },


    onEnterVR:
      function () {
        window.setTimeout(
          this.requestNinetyHz,

          80
        );


        window.setTimeout(
          this.requestNinetyHz,

          300
        );


        window.setTimeout(
          this.requestNinetyHz,

          800
        );
      },


    onExitVR:
      function () {
        this.targetRate =
          null;

        this.supportedRates =
          [];

        this.lastStatus =
          'not-in-xr';
      },


    requestNinetyHz:
      async function () {
        const scene =
          this.el;


        if (
          !roomsEnvironmentIsImmersiveXR(
            scene
          )
        ) {
          return false;
        }


        const xr =
          scene.renderer.xr;


        const session =
          xr.getSession
            ? xr.getSession()
            : null;


        if (
          !session
        ) {
          return false;
        }


        const supported =
          session
            .supportedFrameRates
            ? Array.from(
              session
                .supportedFrameRates
            )
              .map(
                Number
              )
              .filter(
                Number.isFinite
              )
            : [];


        this.supportedRates =
          supported;


        const currentRate =
          typeof session.frameRate ===
          'number'
            ? session.frameRate
            : null;


        /*
          Already running at 90 Hz.
        */

        if (
          currentRate !== null &&
          Math.abs(
            currentRate -
            90
          ) <
          0.5
        ) {
          this.targetRate =
            90;

          this.lastStatus =
            'already-90hz';

          return true;
        }


        const supportsNinety =
          supported.some(
            (rate) =>
              Math.abs(
                rate -
                90
              ) <
              0.5
          );


        if (
          supportsNinety &&
          typeof session
            .updateTargetFrameRate ===
          'function'
        ) {
          try {
            await session
              .updateTargetFrameRate(
                90
              );


            this.targetRate =
              90;


            this.lastStatus =
              'requested-90hz';


            console.log(
              'WebXR refresh-rate target set to 90 Hz.'
            );


            scene.emit(
              'vr-refresh-rate',

              {
                target:
                  90,

                supported
              },

              false
            );


            return true;

          } catch (
            error
          ) {
            this.lastStatus =
              '90hz-request-failed';


            console.warn(
              'WebXR could not switch to 90 Hz:',

              error
            );


            return false;
          }
        }


        this.lastStatus =
          supported.length
            ? '90hz-not-supported'
            : 'refresh-selection-unavailable';


        console.log(
          supported.length
            ? `90 Hz not available. Headset-supported rates: ${supported.join(', ')}`
            : 'Browser does not expose selectable WebXR refresh rates; keeping headset default.'
        );


        return false;
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
    }
  }
);


/* ============================================================
   LIGHTWEIGHT FPS MONITOR

   This does NOT make FPS higher.

   It measures the approximate immersive render rate so you can
   actually check whether the Quest version is near 90 FPS.

   Results:
   getRoomsEnvironmentDebug()
============================================================ */

AFRAME.registerComponent(
  'vr-performance-monitor',
  {
    schema: {
      sampleWindow: {
        default:
          2000
      },

      logInterval: {
        default:
          10000
      }
    },


    init: function () {
      this.frameCount =
        0;

      this.elapsed =
        0;

      this.lastMeasuredFPS =
        null;

      this.lastLogTime =
        0;
    },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !deltaTime ||
        !roomsEnvironmentIsImmersiveXR(
          this.el
        )
      ) {
        this.frameCount =
          0;

        this.elapsed =
          0;

        return;
      }


      this.frameCount +=
        1;


      this.elapsed +=
        deltaTime;


      if (
        this.elapsed <
        this.data
          .sampleWindow
      ) {
        return;
      }


      this.lastMeasuredFPS =
        (
          this.frameCount *
          1000
        ) /
        Math.max(
          this.elapsed,
          1
        );


      this.frameCount =
        0;


      this.elapsed =
        0;


      if (
        time -
        this.lastLogTime >=
        this.data
          .logInterval
      ) {
        this.lastLogTime =
          time;


        console.log(
          `Approximate immersive FPS: ${this.lastMeasuredFPS.toFixed(1)}`
        );
      }
    }
  }
);


/* ============================================================
   ENVIRONMENT DEBUG

   Console:

   getRoomsEnvironmentDebug()
============================================================ */

function getRoomsEnvironmentDebug() {
  const scene =
    document.querySelector(
      'a-scene'
    );


  const rig =
    document.querySelector(
      '#rig'
    );


  const leftHand =
    document.querySelector(
      '#leftHand'
    );


  const comfort =
    scene &&
    scene.components
      ? scene.components[
        'vr-comfort-mode'
      ]
      : null;


  const refresh =
    scene &&
    scene.components
      ? scene.components[
        'vr-refresh-rate-manager'
      ]
      : null;


  const monitor =
    scene &&
    scene.components
      ? scene.components[
        'vr-performance-monitor'
      ]
      : null;


  const collider =
    rig &&
    rig.components
      ? rig.components[
        'quest-room-collider'
      ]
      : null;


  const movementData =
    rig
      ? (
        rig.getAttribute(
          'movement-controls'
        ) || {}
      )
      : {};


  const blinkData =
    leftHand
      ? (
        leftHand.getAttribute(
          'blink-controls'
        ) || {}
      )
      : {};


  return {
    immersiveXR:
      roomsEnvironmentIsImmersiveXR(
        scene
      ),

    paused:
      roomsEnvironmentPaused(),

    teleportFloorCount:
      document
        .querySelectorAll(
          '.floor'
        )
        .length,

    colliderMeshCount:
      collider
        ? collider
          .colliderMeshes
          .length
        : 0,

    smoothMovementEnabled:
      movementData.enabled !==
      false,

    teleportEnabled:
      blinkData.enabled !==
      false,

    comfortModeActive:
      Boolean(
        comfort &&
        comfort.isComfortActive
      ),

    refreshTarget:
      refresh
        ? refresh.targetRate
        : null,

    supportedRefreshRates:
      refresh
        ? refresh
          .supportedRates
        : [],

    refreshStatus:
      refresh
        ? refresh.lastStatus
        : 'manager-not-ready',

    approximateFPS:
      monitor &&
      typeof monitor
        .lastMeasuredFPS ===
      'number'
        ? Number(
          monitor
            .lastMeasuredFPS
            .toFixed(
              1
            )
        )
        : null
  };
}


window.getRoomsEnvironmentDebug =
  getRoomsEnvironmentDebug;


/* ============================================================
   AUTOMATIC ENVIRONMENT SETUP
============================================================ */

function setupRoomsEnvironmentEnhancements() {
  const scene =
    document.querySelector(
      'a-scene'
    );


  if (
    !scene
  ) {
    return;
  }


  if (
    !scene.hasAttribute(
      'vr-comfort-mode'
    )
  ) {
    scene.setAttribute(
      'vr-comfort-mode',

      ''
    );
  }


  if (
    !scene.hasAttribute(
      'vr-refresh-rate-manager'
    )
  ) {
    scene.setAttribute(
      'vr-refresh-rate-manager',

      ''
    );
  }


  if (
    !scene.hasAttribute(
      'vr-performance-monitor'
    )
  ) {
    scene.setAttribute(
      'vr-performance-monitor',

      ''
    );
  }


  scene
    .querySelectorAll(
      '[flicker]'
    )
    .forEach(
      (light) => {
        if (
          !light.hasAttribute(
            'proximity-light-reaction'
          )
        ) {
          light.setAttribute(
            'proximity-light-reaction',

            ''
          );
        }
      }
    );


  console.log(
    'Environment ready: teleport comfort mode + collision + light reactions + 90 Hz request + FPS monitor.'
  );
}


/* ============================================================
   STARTUP
============================================================ */

window.addEventListener(
  'DOMContentLoaded',

  () => {
    const scene =
      document.querySelector(
        'a-scene'
      );


    if (
      !scene
    ) {
      return;
    }


    if (
      scene.hasLoaded
    ) {
      setupRoomsEnvironmentEnhancements();

    } else {
      scene.addEventListener(
        'loaded',

        setupRoomsEnvironmentEnhancements,

        {
          once:
            true
        }
      );
    }
  }
);