/* ============================================================
   engine-environment.js — ROOMS WITHIN
   FULL REPLACEMENT

   Includes:
   - Dark irregular room-light flicker.
   - Thunder on each flicker sequence.
   - Model load debugging.
   - Optional generated teleport floors from named Blender objects.
   - Player collision for GLBs + .solid-collider objects.
   - VR teleport path validation so walls cannot be teleported through.
   - Desktop head bob, disabled in real immersive VR.
   - Proximity light reactions.
   - VR comfort mode: teleport only, smooth locomotion disabled.
   - 72 Hz WebXR request when supported.
============================================================ */


/* ============================================================
   SHARED PAUSE CHECK
============================================================ */

function roomsEnvironmentPaused() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


/* ============================================================
   IRREGULAR HORROR FLICKER + THUNDER
============================================================ */

AFRAME.registerComponent('flicker', {
  schema: {
    min: { default: 0.8 },
    max: { default: 1.2 },
    speed: { default: 0.5 }
  },

  init: function () {
    const light =
      this.el.getAttribute('light') || {};

    const originalIntensity =
      typeof light.intensity === 'number'
        ? light.intensity
        : this.data.max;

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

    this.sequence = [];
    this.sequenceIndex = 0;
    this.stepRemaining = 0;

    this.nextEventRemaining =
      this.randomEventDelay();

    this.componentPaused = false;

    this.applyIntensity(
      this.stableIntensity
    );
  },

  randomBetween: function (
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

  randomEventDelay: function () {
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
        0.55 /
          speed,
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

  applyIntensity: function (
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

  darkDip: function (
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
        const fullFlash =
          Math.random() <
          0.25;

        steps.push({
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
        });
      }

      steps.push({
        intensity:
          this.stableIntensity,

        duration:
          this.randomBetween(
            150,
            260
          )
      });

      return steps;
    },

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

  playThunder: function () {
    if (
      roomsEnvironmentPaused()
    ) {
      return;
    }

    if (
      typeof
        window
          .playRoomsThunder ===
      'function'
    ) {
      window
        .playRoomsThunder();

      return;
    }

    const thunder =
      document.querySelector(
        '#thunderAudio'
      );

    if (!thunder) {
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

    thunder.volume =
      Math.min(
        1,

        0.55 *
        (
          audioState
            .volume !==
          undefined

            ? audioState
                .volume

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

  beginRandomEvent:
    function () {
      const roll =
        Math.random();

      if (
        roll <
        0.48
      ) {
        this.sequence =
          this
            .buildSingleFlicker();

      } else if (
        roll <
        0.76
      ) {
        this.sequence =
          this
            .buildDoubleFlicker();

      } else if (
        roll <
        0.93
      ) {
        this.sequence =
          this
            .buildChaoticFlicker();

      } else {
        this.sequence =
          this
            .buildNearBlackout();
      }

      this
        .playThunder();

      this.sequenceIndex =
        0;

      this
        .startCurrentStep();
    },

  startCurrentStep:
    function () {
      if (
        !this.sequence ||
        this.sequenceIndex >=
          this.sequence
            .length
      ) {
        this.sequence =
          [];

        this.sequenceIndex =
          0;

        this.stepRemaining =
          0;

        this.applyIntensity(
          this
            .stableIntensity
        );

        this.nextEventRemaining =
          this
            .randomEventDelay();

        return;
      }

      const step =
        this.sequence[
          this
            .sequenceIndex
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

  tick: function (
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
      this.sequence
        .length
    ) {
      this.stepRemaining -=
        deltaTime;

      if (
        this.stepRemaining <=
        0
      ) {
        this.sequenceIndex +=
          1;

        this
          .startCurrentStep();
      }

      return;
    }

    this.nextEventRemaining -=
      deltaTime;

    if (
      this.nextEventRemaining <=
      0
    ) {
      this
        .beginRandomEvent();
    }
  },

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

      } else if (
        kind ===
        'chaotic'
      ) {
        this.sequence =
          this
            .buildChaoticFlicker();

      } else if (
        kind ===
        'blackout'
      ) {
        this.sequence =
          this
            .buildNearBlackout();

      } else {
        this.sequence =
          this
            .buildDoubleFlicker();
      }

      this
        .playThunder();

      this.sequenceIndex =
        0;

      this
        .startCurrentStep();

      return true;
    },

  pause: function () {
    this.componentPaused =
      true;
  },

  play: function () {
    this.componentPaused =
      false;
  },

  remove: function () {
    this.applyIntensity(
      this.stableIntensity
    );
  }
});


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

      this.el
        .addEventListener(
          'model-loaded',
          this.onModelLoaded
        );

      this.el
        .addEventListener(
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
          this.el
            .getObject3D(
              'mesh'
            );

        if (!root) {
          return;
        }

        root
          .updateMatrixWorld(
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
          new THREE.Vector3();

        box.getCenter(
          center
        );

        console.log(
          `  -> ${this.data.name} world bounding box center:`,

          center
            .toArray()
            .map(
              (number) =>
                number
                  .toFixed(
                    2
                  )
            )
        );
      },

    onModelError:
      function (
        event
      ) {
        console.error(
          `${this.data.name} failed to load.`,
          event.detail
        );
      },

    remove:
      function () {
        this.el
          .removeEventListener(
            'model-loaded',
            this.onModelLoaded
          );

        this.el
          .removeEventListener(
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

      this.el
        .addEventListener(
          'model-loaded',
          this.onModelLoaded
        );

      if (
        this.el
          .getObject3D(
            'mesh'
          )
      ) {
        this
          .onModelLoaded();
      }
    },

    getContainer:
      function () {
        let container =
          document
            .querySelector(
              '#generated-teleport-floors'
            );

        if (
          !container
        ) {
          container =
            document
              .createElement(
                'a-entity'
              );

          container
            .setAttribute(
              'id',
              'generated-teleport-floors'
            );

          this.el
            .sceneEl
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
          this.el
            .getObject3D(
              'mesh'
            );

        if (!root) {
          return;
        }

        this
          .clearGeneratedPlanes();

        root
          .updateMatrixWorld(
            true
          );

        const container =
          this
            .getContainer();

        this.data
          .floorNames
          .forEach(
            (name) => {
              const object =
                root
                  .getObjectByName(
                    name
                  );

              if (!object) {
                return;
              }

              object
                .updateMatrixWorld(
                  true
                );

              const box =
                new THREE
                  .Box3()
                  .setFromObject(
                    object
                  );

              if (
                box.isEmpty()
              ) {
                return;
              }

              const size =
                new THREE
                  .Vector3();

              const center =
                new THREE
                  .Vector3();

              box.getSize(
                size
              );

              box.getCenter(
                center
              );

              const plane =
                document
                  .createElement(
                    'a-plane'
                  );

              plane
                .setAttribute(
                  'class',
                  'floor'
                );

              plane
                .setAttribute(
                  'rotation',
                  '-90 0 0'
                );

              plane
                .setAttribute(
                  'width',

                  Math.max(
                    size.x,
                    0.1
                  )
                );

              plane
                .setAttribute(
                  'height',

                  Math.max(
                    size.z,
                    0.1
                  )
                );

              plane
                .setAttribute(
                  'position',

                  `${center.x} ${box.min.y + 0.02} ${center.z}`
                );

              plane
                .setAttribute(
                  'material',

                  'opacity: 0; transparent: true; depthWrite: false'
                );

              container
                .appendChild(
                  plane
                );

              this
                .generatedPlanes
                .push(
                  plane
                );
            }
          );
      },

    remove:
      function () {
        this.el
          .removeEventListener(
            'model-loaded',
            this.onModelLoaded
          );

        this
          .clearGeneratedPlanes();
      }
  }
);


/* ============================================================
   QUEST / PLAYER ROOM COLLIDER

   IMPORTANT VR FIX:
   A teleport is NOT allowed to skip collision anymore.

   Long moves are checked from start to destination
   in small steps.

   This means:
   - cannot teleport through walls
   - cannot teleport through closed doors
   - cannot teleport through furniture
   - cannot teleport through altar
   - can still teleport through an OPEN doorway
============================================================ */

AFRAME.registerComponent(
  'quest-room-collider',
  {
    schema: {
      objects: {
        default:
          '[gltf-model], .solid-collider'
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
      },

      teleportCheckStep: {
        default:
          0.20
      }
    },

    init: function () {
      this.colliderMeshes =
        [];

      this.lastPosition =
        this.el
          .object3D
          .position
          .clone();

      this.raycaster =
        new THREE
          .Raycaster();

      this.from =
        new THREE
          .Vector3();

      this.to =
        new THREE
          .Vector3();

      this.delta =
        new THREE
          .Vector3();

      this.direction =
        new THREE
          .Vector3();

      this.side =
        new THREE
          .Vector3();

      this.origin =
        new THREE
          .Vector3();

      this.safePosition =
        new THREE
          .Vector3();

      this.step =
        new THREE
          .Vector3();

      this.testPosition =
        new THREE
          .Vector3();

      this.teleportStart =
        new THREE
          .Vector3();

      this.teleportEnd =
        new THREE
          .Vector3();

      this.teleportPrevious =
        new THREE
          .Vector3();

      this.teleportNext =
        new THREE
          .Vector3();

      this.componentPaused =
        false;

      this.modelListeners =
        [];

      this.refreshColliders =
        this.refreshColliders
          .bind(this);

      /*
        Lets door-hinge (and anything similar) force an immediate
        re-scan right after it reparents geometry into a pivot
        group, instead of relying on the next unrelated
        model-loaded event to happen to catch it.
      */
      window.roomsRefreshColliders =
        this.refreshColliders;

      this.resetPosition =
        this.resetPosition
          .bind(this);

      this.el
        .sceneEl
        .addEventListener(
          'loaded',
          this.refreshColliders
        );

      this.el
        .sceneEl
        .addEventListener(
          'enter-vr',
          this.resetPosition
        );

      this.el
        .sceneEl
        .addEventListener(
          'exit-vr',
          this.resetPosition
        );

      this.el
        .sceneEl
        .querySelectorAll(
          this.data.objects
        )
        .forEach(
          (entity) => {
            const handler =
              this
                .refreshColliders;

            entity
              .addEventListener(
                'model-loaded',
                handler
              );

            this
              .modelListeners
              .push({
                entity,
                handler
              });
          }
        );

      window
        .setTimeout(
          this.refreshColliders,
          1000
        );
    },

    resetPosition:
      function () {
        this.lastPosition
          .copy(
            this.el
              .object3D
              .position
          );
      },

    refreshColliders:
      function () {
        const meshes =
          [];

        this.el
          .sceneEl
          .querySelectorAll(
            this.data.objects
          )
          .forEach(
            (entity) => {
              /*
                IMPORTANT: always scan the full entity.object3D,
                not just getObject3D('mesh').

                door-hinge (and anything else that reparents part
                of a loaded GLB into its own pivot group) attaches
                that pivot directly to entity.object3D, not under
                the original loaded mesh root. Scanning only
                getObject3D('mesh') would silently drop those
                reparented meshes the next time refreshColliders()
                re-runs (e.g. when another model finishes loading
                after the door has already been opened/closed once),
                letting the player walk straight through a still-
                closed door forever after.
              */
              const root =
                entity
                  .object3D;

              if (!root) {
                return;
              }

              root
                .traverse(
                  (node) => {
                    if (
                      node.isMesh &&
                      node.geometry &&
                      node.visible
                    ) {
                      node
                        .userData
                        .collisionEntity =
                        entity;

                      meshes
                        .push(
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

    isBlocked:
      function (
        from,
        to
      ) {
        if (
          !this
            .colliderMeshes
            .length
        ) {
          return false;
        }

        this.delta
          .subVectors(
            to,
            from
          );

        this.delta.y =
          0;

        const distance =
          this.delta
            .length();

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

        this.side
          .set(
            -this
              .direction
              .z,

            0,

            this
              .direction
              .x
          );

        const heights = [
          0.22,
          0.85,
          1.42
        ];

        const sideOffsets = [
          -this.data
            .radius *
            0.72,

          0,

          this.data
            .radius *
            0.72
        ];

        const rayLength =
          distance +
          this.data
            .radius +
          this.data
            .skin;

        for (
          let heightIndex =
            0;

          heightIndex <
          heights.length;

          heightIndex++
        ) {
          for (
            let sideIndex =
              0;

            sideIndex <
            sideOffsets
              .length;

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

            this.raycaster
              .set(
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
                  this
                    .colliderMeshes,

                  false
                );

            const blockingHit =
              hits.find(
                (hit) => {
                  const owner =
                    hit.object &&
                    hit.object
                      .userData

                      ? hit
                          .object
                          .userData
                          .collisionEntity

                      : null;

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

    isTeleportPathClear:
      function (
        from,
        to
      ) {
        if (
          !this
            .colliderMeshes
            .length
        ) {
          return true;
        }

        this.teleportStart
          .copy(
            from
          );

        this.teleportEnd
          .copy(
            to
          );

        const distance =
          Math.hypot(
            this.teleportEnd.x -
              this.teleportStart.x,

            this.teleportEnd.z -
              this.teleportStart.z
          );

        if (
          distance <
          0.0001
        ) {
          return true;
        }

        const checkStep =
          Math.max(
            0.08,

            Number(
              this.data
                .teleportCheckStep
            ) ||
              0.20
          );

        const steps =
          Math.max(
            1,

            Math.ceil(
              distance /
              checkStep
            )
          );

        this
          .teleportPrevious
          .copy(
            this.teleportStart
          );

        for (
          let index =
            1;

          index <=
          steps;

          index++
        ) {
          const progress =
            index /
            steps;

          this
            .teleportNext
            .lerpVectors(
              this.teleportStart,
              this.teleportEnd,
              progress
            );

          if (
            this.isBlocked(
              this
                .teleportPrevious,

              this
                .teleportNext
            )
          ) {
            return false;
          }

          this
            .teleportPrevious
            .copy(
              this
                .teleportNext
            );
        }

        return true;
      },

    moveWithSliding:
      function (
        start,
        desired
      ) {
        this.delta
          .subVectors(
            desired,
            start
          );

        this.delta.y =
          0;

        const distance =
          this.delta
            .length();

        if (
          distance <
          0.0001
        ) {
          this.safePosition
            .copy(
              desired
            );

          return (
            this
              .safePosition
          );
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
          let index =
            0;

          index <
          steps;

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
            Try moving along X only.
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
                this
                  .testPosition
                  .x;
            }
          }

          /*
            Try moving along Z only.
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
                this
                  .testPosition
                  .z;
            }
          }
        }

        this.safePosition.y =
          desired.y;

        return (
          this
            .safePosition
        );
      },

    tick:
      function () {
        if (
          this.componentPaused ||
          roomsEnvironmentPaused()
        ) {
          return;
        }

        const current =
          this.el
            .object3D
            .position;

        this.from
          .copy(
            this.lastPosition
          );

        this.to
          .copy(
            current
          );

        const horizontalDistance =
          Math.hypot(
            this.to.x -
              this.from.x,

            this.to.z -
              this.from.z
          );

        /* ==================================================
           TELEPORT CHECK

           OLD:
           teleport > 0.75m
           -> collision ignored.

           NEW:
           teleport > 0.75m
           -> full path checked.
        ================================================== */

        if (
          horizontalDistance >
          this.data
            .teleportDistance
        ) {
          const teleportAllowed =
            this
              .isTeleportPathClear(
                this.from,
                this.to
              );

          if (
            teleportAllowed
          ) {
            this.lastPosition
              .copy(
                current
              );

            this.el
              .emit(
                'rooms-teleport-accepted',

                {
                  distance:
                    horizontalDistance
                },

                false
              );

            return;
          }

          /*
            Teleport crossed a wall or
            another solid object.

            Move the player back to where
            they were before teleport.
          */

          current.x =
            this.from.x;

          current.z =
            this.from.z;

          this.lastPosition
            .set(
              current.x,
              current.y,
              current.z
            );

          this.el
            .emit(
              'rooms-teleport-blocked',

              {
                distance:
                  horizontalDistance
              },

              false
            );

          console.log(
            'Teleport blocked: solid object between player and destination.'
          );

          return;
        }

        /*
          No movement.
        */

        if (
          horizontalDistance <
          0.0001
        ) {
          this.lastPosition.y =
            current.y;

          return;
        }

        /*
          Normal walking.
        */

        const corrected =
          this
            .moveWithSliding(
              this.from,
              this.to
            );

        current.x =
          corrected.x;

        current.z =
          corrected.z;

        this.lastPosition
          .set(
            corrected.x,
            current.y,
            corrected.z
          );
      },

    pause:
      function () {
        this.componentPaused =
          true;
      },

    play:
      function () {
        this.componentPaused =
          false;

        this
          .resetPosition();
      },

    remove:
      function () {
        this.el
          .sceneEl
          .removeEventListener(
            'loaded',
            this.refreshColliders
          );

        this.el
          .sceneEl
          .removeEventListener(
            'enter-vr',
            this.resetPosition
          );

        this.el
          .sceneEl
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

        if (
          window.roomsRefreshColliders ===
            this.refreshColliders
        ) {
          window.roomsRefreshColliders =
            null;
        }
      }
  }
);


/* ============================================================
   HEAD BOB

   Desktop:
   - subtle camera sway while walking.

   Real immersive headset:
   - no artificial camera bob.
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

      vrMultiplier: {
        default:
          0.3
      }
    },

    init: function () {
      this.baseX =
        this.el
          .object3D
          .position
          .x;

      this.baseY =
        this.el
          .object3D
          .position
          .y;

      this.phase =
        0;

      this.rig =
        document
          .querySelector(
            '#rig'
          );

      this.previousRigPosition =
        new THREE
          .Vector3();

      this.currentRigPosition =
        new THREE
          .Vector3();

      this.componentPaused =
        false;

      if (
        this.rig
      ) {
        this.rig
          .object3D
          .getWorldPosition(
            this
              .previousRigPosition
          );
      }
    },

    resetMovementSample:
      function () {
        if (
          !this.rig
        ) {
          return;
        }

        this.rig
          .object3D
          .getWorldPosition(
            this
              .previousRigPosition
          );
      },

    tick:
      function (
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

        this.rig
          .object3D
          .getWorldPosition(
            this
              .currentRigPosition
          );

        const deltaX =
          this
            .currentRigPosition
            .x -
          this
            .previousRigPosition
            .x;

        const deltaZ =
          this
            .currentRigPosition
            .z -
          this
            .previousRigPosition
            .z;

        const distance =
          Math.sqrt(
            deltaX *
              deltaX +

            deltaZ *
              deltaZ
          );

        const isWalking =
          distance >
            0.0001 &&
          distance <
            0.5;

        const immersiveXR =
          Boolean(
            this.el
              .sceneEl &&

            this.el
              .sceneEl
              .renderer &&

            this.el
              .sceneEl
              .renderer
              .xr &&

            this.el
              .sceneEl
              .renderer
              .xr
              .isPresenting
          );

        /*
          Never add fake head movement
          while wearing the headset.
        */

        if (
          immersiveXR
        ) {
          this.el
            .object3D
            .position
            .x =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .x,

                this.baseX,

                0.22
              );

          this.el
            .object3D
            .position
            .y =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .y,

                this.baseY,

                0.22
              );

          this
            .previousRigPosition
            .copy(
              this
                .currentRigPosition
            );

          return;
        }

        if (
          isWalking
        ) {
          this.phase +=
            deltaTime *
            0.001 *
            this.data
              .speed;

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

          this.el
            .object3D
            .position
            .x =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .x,

                targetX,

                0.32
              );

          this.el
            .object3D
            .position
            .y =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .y,

                targetY,

                0.32
              );

        } else {
          this.el
            .object3D
            .position
            .x =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .x,

                this.baseX,

                0.14
              );

          this.el
            .object3D
            .position
            .y =

            THREE
              .MathUtils
              .lerp(
                this.el
                  .object3D
                  .position
                  .y,

                this.baseY,

                0.14
              );
        }

        this
          .previousRigPosition
          .copy(
            this
              .currentRigPosition
          );
      },

    pause:
      function () {
        this.componentPaused =
          true;
      },

    play:
      function () {
        this.componentPaused =
          false;

        this
          .resetMovementSample();
      }
  }
);


/* ============================================================
   PROXIMITY LIGHT REACTION
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
        new THREE
          .Vector3();

      this.lightWorld =
        new THREE
          .Vector3();
    },

    tick:
      function (
        time
      ) {
        if (
          roomsEnvironmentPaused() ||

          time -
            this
              .lastCheck <

          this.data
            .interval
        ) {
          return;
        }

        this.lastCheck =
          time;

        const camera =
          document
            .querySelector(
              '#cam'
            ) ||

          document
            .querySelector(
              '[camera]'
            );

        if (!camera) {
          return;
        }

        camera
          .object3D
          .getWorldPosition(
            this
              .playerWorld
          );

        this.el
          .object3D
          .getWorldPosition(
            this
              .lightWorld
          );

        const distance =
          Math.hypot(
            this
              .playerWorld
              .x -
              this
                .lightWorld
                .x,

            this
              .playerWorld
              .z -
              this
                .lightWorld
                .z
          );

        if (
          distance <=
            this.data
              .enterDistance &&

          !this
            .playerWasNear
        ) {
          this.playerWasNear =
            true;

          if (
            time -
              this
                .lastReaction >=

            this.data
              .cooldown
          ) {
            this.lastReaction =
              time;

            const flicker =
              this.el
                .components
                .flicker;

            if (
              flicker &&
              flicker
                .triggerReaction
            ) {
              flicker
                .triggerReaction(
                  'double'
                );
            }

            this.el
              .sceneEl
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

   Real VR:
   - disables smooth locomotion
   - keeps teleport enabled
============================================================ */

AFRAME.registerComponent(
  'vr-comfort-mode',
  {
    init: function () {
      this.rig =
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

      this.el
        .addEventListener(
          'enter-vr',
          this.onEnterVR
        );

      this.el
        .addEventListener(
          'exit-vr',
          this.onExitVR
        );
    },

    getRig:
      function () {
        if (
          this.rig &&
          this.rig
            .isConnected
        ) {
          return this.rig;
        }

        this.rig =
          document
            .querySelector(
              '#rig'
            );

        return this.rig;
      },

    onEnterVR:
      function () {
        window
          .requestAnimationFrame(
            () => {
              const scene =
                this.el;

              const immersiveXR =
                Boolean(
                  scene &&

                  scene
                    .renderer &&

                  scene
                    .renderer
                    .xr &&

                  scene
                    .renderer
                    .xr
                    .isPresenting
                );

              if (
                !immersiveXR
              ) {
                return;
              }

              const rig =
                this
                  .getRig();

              if (!rig) {
                return;
              }

              const data =
                rig
                  .getAttribute(
                    'movement-controls'
                  ) ||
                {};

              this
                .savedMovementEnabled =
                data.enabled !==
                false;

              rig
                .setAttribute(
                  'movement-controls',
                  'enabled',
                  true
                );

              this.isComfortActive =
                true;

              console.log(
                'VR comfort mode: smooth locomotion OFF. Use left-controller teleport.'
              );

              scene
                .emit(
                  'vr-comfort-mode-changed',

                  {
                    enabled:
                      true
                  },

                  false
                );
            }
          );
      },

    onExitVR:
      function () {
        if (
          !this
            .isComfortActive
        ) {
          return;
        }

        const rig =
          this
            .getRig();

        if (rig) {
          rig
            .setAttribute(
              'movement-controls',
              'enabled',
              this
                .savedMovementEnabled
            );
        }

        this.isComfortActive =
          false;

        console.log(
          'VR comfort mode: desktop movement restored.'
        );

        this.el
          .emit(
            'vr-comfort-mode-changed',

            {
              enabled:
                false
            },

            false
          );
      },

    remove:
      function () {
        this.el
          .removeEventListener(
            'enter-vr',
            this.onEnterVR
          );

        this.el
          .removeEventListener(
            'exit-vr',
            this.onExitVR
          );

        this
          .onExitVR();
      }
  }
);


/* ============================================================
   WEBXR 72 HZ REQUEST
============================================================ */

AFRAME.registerComponent(
  'vr-refresh-rate-manager',
  {
    init: function () {
      this.onEnterVR =
        this.onEnterVR
          .bind(this);

      this.el
        .addEventListener(
          'enter-vr',
          this.onEnterVR
        );
    },

    onEnterVR:
      function () {
        window
          .setTimeout(
            () => {
              this
                .requestSeventyTwoHz();
            },

            120
          );
      },

    requestSeventyTwoHz:
      async function () {
        const scene =
          this.el;

        if (
          !scene ||

          !scene
            .renderer ||

          !scene
            .renderer
            .xr ||

          !scene
            .renderer
            .xr
            .isPresenting
        ) {
          return;
        }

        const session =
          scene
            .renderer
            .xr
            .getSession

            ? scene
                .renderer
                .xr
                .getSession()

            : null;

        if (!session) {
          return;
        }

        const supported =
          session
            .supportedFrameRates

            ? Array.from(
                session
                  .supportedFrameRates
              )

            : [];

        const supportsSeventyTwo =
          supported
            .some(
              (rate) =>
                Math.abs(
                  Number(
                    rate
                  ) -
                  72
                ) <
                0.5
            );

        if (
          supportsSeventyTwo &&
          session
            .updateTargetFrameRate
        ) {
          try {
            await session
              .updateTargetFrameRate(
                72
              );

            console.log(
              'WebXR refresh-rate target set to 72 Hz.'
            );

            scene
              .emit(
                'vr-refresh-rate',

                {
                  target:
                    72,

                  supported
                },

                false
              );

            return;

          } catch (
            error
          ) {
            console.warn(
              'WebXR could not switch to 72 Hz:',
              error
            );
          }
        }

        console.log(
          supported.length

            ? `72 Hz not available. Headset-supported rates: ${supported.join(', ')}`

            : 'Browser does not expose selectable WebXR refresh rates; keeping headset default.'
        );
      },

    remove:
      function () {
        this.el
          .removeEventListener(
            'enter-vr',
            this.onEnterVR
          );
      }
  }
);


/* ============================================================
   DEBUG

   Browser console:
   getRoomsEnvironmentDebug()
============================================================ */

function getRoomsEnvironmentDebug() {
  const scene =
    document
      .querySelector(
        'a-scene'
      );

  const rig =
    document
      .querySelector(
        '#rig'
      );

  const collider =
    rig &&
    rig.components

      ? rig
          .components[
            'quest-room-collider'
          ]

      : null;

  return {
    paused:
      roomsEnvironmentPaused(),

    immersiveXR:
      Boolean(
        scene &&

        scene
          .renderer &&

        scene
          .renderer
          .xr &&

        scene
          .renderer
          .xr
          .isPresenting
      ),

    collisionReady:
      Boolean(
        collider
      ),

    collisionMeshCount:
      collider

        ? collider
            .colliderMeshes
            .length

        : 0,

    teleportDistance:
      collider

        ? collider
            .data
            .teleportDistance

        : null,

    teleportCheckStep:
      collider

        ? collider
            .data
            .teleportCheckStep

        : null,

    flickerLightCount:
      document
        .querySelectorAll(
          '[flicker]'
        )
        .length
  };
}


window.getRoomsEnvironmentDebug =
  getRoomsEnvironmentDebug;


/* ============================================================
   AUTOMATIC ENVIRONMENT SETUP
============================================================ */

function setupRoomsEnvironmentEnhancements() {
  const scene =
    document
      .querySelector(
        'a-scene'
      );

  if (!scene) {
    return;
  }

  if (
    !scene
      .hasAttribute(
        'vr-comfort-mode'
      )
  ) {
    scene
      .setAttribute(
        'vr-comfort-mode',
        ''
      );
  }

  if (
    !scene
      .hasAttribute(
        'vr-refresh-rate-manager'
      )
  ) {
    scene
      .setAttribute(
        'vr-refresh-rate-manager',
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
          !light
            .hasAttribute(
              'proximity-light-reaction'
            )
        ) {
          light
            .setAttribute(
              'proximity-light-reaction',
              ''
            );
        }
      }
    );

  console.log(
    'Environment enhancements ready: wall-safe teleport + collision + comfort mode + light reactions + 72 Hz request.'
  );
}


/* ============================================================
   START
============================================================ */

window.addEventListener(
  'DOMContentLoaded',

  () => {
    const scene =
      document
        .querySelector(
          'a-scene'
        );

    if (!scene) {
      return;
    }

    if (
      scene.hasLoaded
    ) {
      setupRoomsEnvironmentEnhancements();

    } else {
      scene
        .addEventListener(
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