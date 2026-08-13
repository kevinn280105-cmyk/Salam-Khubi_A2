/* ============================================================
   engine-environment.js
   Environment, teleport floors, collision and head movement
============================================================ */


/* ============================================================
   LIGHT FLICKER
============================================================ */

AFRAME.registerComponent('flicker', {
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
    this.seed =
      Math.random() * 1000;
  },


  tick: function (timeMs) {
    const time =
      (
        timeMs *
        0.001 *
        this.data.speed
      ) +
      this.seed;


    /*
      Mix several sine waves together
      so the light does not flicker in
      an obvious repeating pattern.
    */
    const noise = (
      Math.sin(
        time * 6.1
      ) +
      Math.sin(
        time * 2.3
      ) +
      Math.sin(
        time * 11.7
      )
    ) / 3;


    const intensity =
      this.data.min +
      (
        (noise + 1) / 2
      ) *
      (
        this.data.max -
        this.data.min
      );


    this.el.setAttribute(
      'light',
      'intensity',
      intensity
    );
  }
});


/* ============================================================
   MODEL STATUS / DEBUGGING

   Prints information into the browser console
   when a GLB loads or fails.
============================================================ */

AFRAME.registerComponent(
  'model-status',
  {
    schema: {
      name: {
        default: '3D model'
      }
    },


    init: function () {

      /*
        Successful model load.
      */
      this.el.addEventListener(
        'model-loaded',
        () => {

          console.log(
            `${this.data.name} loaded successfully.`
          );


          const root =
            this.el.getObject3D(
              'mesh'
            );


          if (root) {

            root.updateMatrixWorld(
              true
            );


            const box =
              new THREE.Box3()
                .setFromObject(
                  root
                );


            if (!box.isEmpty()) {

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
                      number.toFixed(2)
                  )
              );
            }
          }
        }
      );


      /*
        Failed model load.
      */
      this.el.addEventListener(
        'model-error',
        (event) => {

          console.error(
            `${this.data.name} failed to load.`,
            event.detail
          );
        }
      );
    }
  }
);


/* ============================================================
   AUTOMATIC TELEPORT FLOORS

   Looks inside imported Blender models for floor objects
   with these names.

   Then it creates invisible A-Frame teleport planes over them.
============================================================ */

AFRAME.registerComponent(
  'tag-floors',
  {
    schema: {
      floorNames: {
        type: 'array',

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

      this.el.addEventListener(
        'model-loaded',
        () => {

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


          /*
            All generated invisible teleport
            planes live inside one container.
          */
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


          /*
            Find each named Blender floor.
          */
          this.data.floorNames
            .forEach(
              (name) => {

                const object =
                  root.getObjectByName(
                    name
                  );


                /*
                  That room model simply does
                  not contain this floor name.
                */
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


                if (box.isEmpty()) {
                  return;
                }


                const size =
                  new THREE.Vector3();


                const center =
                  new THREE.Vector3();


                box.getSize(
                  size
                );


                box.getCenter(
                  center
                );


                /*
                  Create invisible teleport plane.
                */
                const plane =
                  document
                    .createElement(
                      'a-plane'
                    );


                plane.setAttribute(
                  'class',
                  'floor'
                );


                /*
                  A-Frame planes normally stand vertically,
                  so rotate it flat.
                */
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


                /*
                  Place it slightly above the
                  actual model floor.
                */
                plane.setAttribute(
                  'position',
                  `${center.x} ${box.min.y + 0.02} ${center.z}`
                );


                /*
                  Invisible but still usable
                  by blink-controls.
                */
                plane.setAttribute(
                  'material',
                  'opacity: 0; transparent: true; depthWrite: false'
                );


                container.appendChild(
                  plane
                );
              }
            );
        }
      );
    }
  }
);


/* ============================================================
   PLAYER COLLISION SYSTEM

   Prevents the player from simply walking
   through walls, furniture and other GLBs.
============================================================ */

AFRAME.registerComponent(
  'quest-room-collider',
  {
    schema: {

      /*
        By default every entity that loads
        a GLB can become a collider.
      */
      objects: {
        default:
          '[gltf-model]'
      },


      /*
        Approximate player body radius.
      */
      radius: {
        default: 0.32
      },


      /*
        Small extra safety gap between
        player and geometry.
      */
      skin: {
        default: 0.035
      },


      /*
        Large movements are split into
        smaller collision steps.
      */
      maxSubstep: {
        default: 0.12
      },


      /*
        Movement larger than this is treated
        like teleporting instead of walking.
      */
      teleportDistance: {
        default: 0.75
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


      this.refreshColliders =
        this.refreshColliders
          .bind(this);


      /*
        Build collider list after scene load.
      */
      this.el.sceneEl
        .addEventListener(
          'loaded',
          this.refreshColliders
        );


      /*
        When entering or leaving VR,
        reset the remembered position.
      */
      this.el.sceneEl
        .addEventListener(
          'enter-vr',
          () =>
            this.resetPosition()
        );


      this.el.sceneEl
        .addEventListener(
          'exit-vr',
          () =>
            this.resetPosition()
        );


      /*
        Refresh whenever one of the GLB
        entities finishes loading.
      */
      this.el.sceneEl
        .querySelectorAll(
          this.data.objects
        )
        .forEach(
          (entity) => {

            entity.addEventListener(
              'model-loaded',
              this.refreshColliders
            );
          }
        );


      /*
        Backup refresh in case a load event
        happens before the listener is ready.
      */
      window.setTimeout(
        this.refreshColliders,
        1000
      );
    },


    /* ======================================================
       RESET MOVEMENT REFERENCE
    ====================================================== */

    resetPosition: function () {

      this.lastPosition.copy(
        this.el.object3D.position
      );
    },


    /* ======================================================
       BUILD COLLIDER MESH LIST
    ====================================================== */

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

                    /*
                      Remember which A-Frame
                      entity owns this mesh.
                    */
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


    /* ======================================================
       CHECK WHETHER MOVEMENT IS BLOCKED

       We cast rays at several heights and
       sideways offsets to approximate a body.
    ====================================================== */

    isBlocked:
      function (
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


        /*
          Ignore vertical movement.
          This system is mainly preventing
          horizontal wall penetration.
        */
        this.delta.y = 0;


        const distance =
          this.delta.length();


        if (
          distance < 0.0001
        ) {
          return false;
        }


        this.direction
          .copy(
            this.delta
          )
          .normalize();


        /*
          Vector pointing sideways relative
          to walking direction.
        */
        this.side.set(
          -this.direction.z,
          0,
          this.direction.x
        );


        /*
          Check near:
          - legs
          - torso
          - upper body
        */
        const heights = [
          0.22,
          0.85,
          1.42
        ];


        /*
          Check:
          - left side
          - centre
          - right side
        */
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


            /*
              Move ray origin very slightly
              forward to avoid self-contact
              problems.
            */
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
                    hit.object.userData

                      ? hit.object
                          .userData
                          .collisionEntity

                      : null;


                  /*
                    Do not collide with an
                    object the player is
                    currently holding.
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


            if (blockingHit) {
              return true;
            }
          }
        }


        return false;
      },


    /* ======================================================
       MOVE WITH WALL SLIDING

       Instead of completely stopping the
       player, try X and Z separately.

       This lets the player naturally slide
       along walls.
    ====================================================== */

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
          distance < 0.0001
        ) {

          this.safePosition.copy(
            desired
          );


          return (
            this.safePosition
          );
        }


        /*
          Break larger movements into
          smaller collision checks.
        */
        const steps =
          Math.max(
            1,
            Math.ceil(
              distance /
              this.data.maxSubstep
            )
          );


        this.step
          .copy(
            this.delta
          )
          .divideScalar(
            steps
          );


        this.safePosition.copy(
          start
        );


        for (
          let index = 0;
          index < steps;
          index++
        ) {


          /*
            First try the complete movement.
          */
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

            this.safePosition.copy(
              this.testPosition
            );


            continue;
          }


          /*
            Full movement was blocked.

            Try only X.
          */
          if (
            Math.abs(
              this.step.x
            ) >
            0.0001
          ) {

            this.testPosition.copy(
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
            Then try only Z.
          */
          if (
            Math.abs(
              this.step.z
            ) >
            0.0001
          ) {

            this.testPosition.copy(
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


        /*
          Keep whatever Y movement the
          movement-controls system produced.
        */
        this.safePosition.y =
          desired.y;


        return (
          this.safePosition
        );
      },


    /* ======================================================
       PLAYER MOVEMENT UPDATE
    ====================================================== */

    tick:
      function () {

        const current =
          this.el.object3D.position;


        this.from.copy(
          this.lastPosition
        );


        this.to.copy(
          current
        );


        /*
          Measure horizontal movement.
        */
        const horizontalDistance =
          Math.hypot(
            this.to.x -
              this.from.x,

            this.to.z -
              this.from.z
          );


        /*
          Large jump = probably teleport.

          Do not run wall-sliding correction
          across the whole teleport distance.
        */
        if (
          horizontalDistance >
          this.data
            .teleportDistance
        ) {

          this.lastPosition.copy(
            current
          );


          return;
        }


        /*
          No meaningful movement.
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
          Correct attempted movement.
        */
        const corrected =
          this.moveWithSliding(
            this.from,
            this.to
          );


        current.x =
          corrected.x;


        current.z =
          corrected.z;


        /*
          Store final legal position.
        */
        this.lastPosition.set(
          corrected.x,
          current.y,
          corrected.z
        );
      }
  }
);


/* ============================================================
   HEAD BOB / WALKING SWAY

   IMPORTANT FIX:

   The old code used:

   scene.is('vr-mode')

   That can also be true during Mac fullscreen.

   Now only an actual immersive WebXR headset
   gets the reduced VR head movement.

   Mac fullscreen keeps the normal subtle
   desktop walking movement.
============================================================ */

AFRAME.registerComponent(
  'head-bob',
  {
    schema: {

      verticalAmount: {
        default: 0.026
      },


      sideAmount: {
        default: 0.014
      },


      speed: {
        default: 8.5
      },


      /*
        VR needs much weaker artificial
        head movement because strong
        head bob can feel uncomfortable
        inside a headset.
      */
      vrMultiplier: {
        default: 0.3
      }
    },


    init: function () {

      /*
        Remember original camera location.
      */
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


      if (this.rig) {

        this.rig.object3D
          .getWorldPosition(
            this.previousRigPosition
          );
      }
    },


    tick:
      function (
        time,
        deltaTime
      ) {

        if (
          !deltaTime ||
          !this.rig
        ) {
          return;
        }


        /*
          Current rig position.
        */
        this.rig.object3D
          .getWorldPosition(
            this.currentRigPosition
          );


        const deltaX =
          this.currentRigPosition.x -
          this.previousRigPosition.x;


        const deltaZ =
          this.currentRigPosition.z -
          this.previousRigPosition.z;


        const distance =
          Math.sqrt(
            deltaX * deltaX +
            deltaZ * deltaZ
          );


        /*
          Ignore extremely tiny movement
          and large teleport jumps.
        */
        const isWalking =
          distance > 0.0001 &&
          distance < 0.5;


        /*
          REAL headset detection.

          Mac fullscreen is NOT counted
          as immersive VR here.
        */
        const immersiveXR =
          Boolean(
            this.el.sceneEl &&
            this.el.sceneEl.renderer &&
            this.el.sceneEl.renderer.xr &&
            this.el.sceneEl.renderer.xr
              .isPresenting
          );


        /*
          Desktop:
            scale = 1

          Quest:
            scale = 0.3
        */
        const movementScale =
          immersiveXR

            ? this.data
                .vrMultiplier

            : 1;


        if (isWalking) {

          /*
            Advance walking cycle.
          */
          this.phase +=
            deltaTime *
            0.001 *
            this.data.speed;


          /*
            Gentle left/right sway.
          */
          const targetX =
            this.baseX +
            Math.sin(
              this.phase
            ) *
            this.data
              .sideAmount *
            movementScale;


          /*
            Vertical footstep movement.

            phase * 2 means two vertical
            movements for each full
            left/right walking cycle.
          */
          const targetY =
            this.baseY +
            Math.sin(
              this.phase * 2
            ) *
            this.data
              .verticalAmount *
            movementScale;


          /*
            Smoothly move toward target
            instead of snapping.
          */
          this.el.object3D
            .position.x =
            THREE.MathUtils.lerp(
              this.el.object3D
                .position.x,

              targetX,

              0.32
            );


          this.el.object3D
            .position.y =
            THREE.MathUtils.lerp(
              this.el.object3D
                .position.y,

              targetY,

              0.32
            );

        } else {

          /*
            Not walking:
            gently return camera to its
            normal position.
          */
          this.el.object3D
            .position.x =
            THREE.MathUtils.lerp(
              this.el.object3D
                .position.x,

              this.baseX,

              0.14
            );


          this.el.object3D
            .position.y =
            THREE.MathUtils.lerp(
              this.el.object3D
                .position.y,

              this.baseY,

              0.14
            );
        }


        /*
          Save position for next frame.
        */
        this.previousRigPosition
          .copy(
            this.currentRigPosition
          );
      }
  }
);