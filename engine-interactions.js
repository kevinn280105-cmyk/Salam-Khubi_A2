/* ============================================================
   engine-interactions.js
   Door interaction + object grabbing
============================================================ */

function isImmersiveXRScene(scene) {
  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}

/* ============================================================
   DOOR SYSTEM
============================================================ */

AFRAME.registerComponent('door-hinge', {
  schema: {
    openAngle: { default: 100 },

    hingeSide: {
      default: 'left',
      oneOf: ['left', 'right']
    },

    direction: { default: 1 },

    duration: { default: 650 }
  },

  init: function () {
    this.root = null;

    this.parts = [];

    this.partStates =
      new Map();

    this.lastActivation = 0;

    this.lastActiveState = null;

    this.closeTarget = null;


    this.el.addEventListener(
      'model-loaded',
      () => {
        this.prepareDoorParts();

        this.createCloseTarget();
      }
    );


    this.el.addEventListener(
      'activate-object',
      (event) => {
        const hitObject =
          event.detail &&
          event.detail.object
            ? event.detail.object
            : null;

        this.activatePart(
          hitObject
        );
      }
    );


    /*
      MAC / DESKTOP CLICK

      Do NOT use:

      scene.is('vr-mode')

      here.

      A-Frame can consider desktop fullscreen
      to be vr-mode too.

      We only block mouse interaction during
      an ACTUAL WebXR headset session.
    */
    this.el.addEventListener(
      'click',
      (event) => {
        if (
          isImmersiveXRScene(
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


        const hitObject =
          event &&
          event.detail &&
          event.detail.intersection
            ? event.detail.intersection.object
            : null;


        /*
          If we clicked an actual individual
          door part, toggle that exact part.
        */
        if (
          hitObject &&
          this.activatePart(
            hitObject
          )
        ) {
          return;
        }


        /*
          If the door entity itself was clicked
          but the exact internal mesh was not
          identified, close an open door instead
          of doing nothing.
        */
        this.closeOpenDoor();
      }
    );
  },


  /* ========================================================
     CHECK WHETHER AN OBJECT CONTAINS A MESH
  ======================================================== */

  hasMeshDescendant: function (
    object
  ) {
    let found = false;


    object.traverse(
      (node) => {
        if (node.isMesh) {
          found = true;
        }
      }
    );


    return found;
  },


  /* ========================================================
     FIND INDIVIDUAL DOOR PARTS INSIDE cua.glb

     This preserves your original system.

     If cua.glb contains two separate doors,
     both can still be clicked separately.
  ======================================================== */

  prepareDoorParts: function () {
    this.root =
      this.el.getObject3D(
        'mesh'
      );


    if (!this.root) {
      return;
    }


    let container =
      this.root;


    /*
      Sometimes Blender GLBs contain several
      wrapper groups.

      Move down through single wrapper groups
      until we find the useful children.
    */
    while (true) {
      const meaningfulChildren =
        container.children.filter(
          (child) =>
            this.hasMeshDescendant(
              child
            )
        );


      if (
        meaningfulChildren.length !== 1 ||
        meaningfulChildren[0].isMesh
      ) {
        break;
      }


      container =
        meaningfulChildren[0];
    }


    /*
      Keep the individual Blender objects.

      For example:

      cua.glb
        ├── LeftDoor
        └── RightDoor

      becomes two selectable parts.
    */
    this.parts =
      container.children.filter(
        (child) =>
          this.hasMeshDescendant(
            child
          )
      );


    /*
      If the GLB does not contain separate
      child groups, treat the entire model
      as one door.
    */
    if (!this.parts.length) {
      this.parts = [
        container
      ];
    }


    console.log(
      `Door model contains ${this.parts.length} selectable part(s).`
    );
  },


  /* ========================================================
     SMALL CLOSE-ONLY TARGET

     This replaces the OLD giant invisible
     .door-press-target.

     IMPORTANT:

     This target does NOT open a door.

     It only becomes active after a door
     has already opened.

     This allows Mac users to close a door
     even after the physical panel has swung
     away from the original doorway.
  ======================================================== */

  createCloseTarget: function () {
    if (
      this.closeTarget ||
      !this.root
    ) {
      return;
    }


    this.root.updateMatrixWorld(
      true
    );


    const box =
      new THREE.Box3()
        .setFromObject(
          this.root
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


    const target =
      document.createElement(
        'a-box'
      );


    target.setAttribute(
      'id',
      'doorCloseTarget'
    );


    target.setAttribute(
      'position',
      `${center.x} ${center.y} ${center.z}`
    );


    /*
      Much smaller than the old invisible
      door target.

      Old system used nearly 100% of the
      door model.

      This uses roughly 28% width and
      30% height.
    */
    target.setAttribute(
      'width',
      Math.max(
        size.x * 0.28,
        0.18
      )
    );


    target.setAttribute(
      'height',
      Math.max(
        size.y * 0.30,
        0.42
      )
    );


    target.setAttribute(
      'depth',
      Math.max(
        size.z * 0.28,
        0.12
      )
    );


    /*
      Completely invisible.
    */
    target.setAttribute(
      'material',
      'opacity: 0; transparent: true; depthWrite: false; side: double'
    );


    /*
      Starts disabled.

      It becomes visible to the raycaster
      only while a door is open.
    */
    target.setAttribute(
      'visible',
      false
    );


    /*
      MAC CLICK

      This area can ONLY close.
      It cannot open a closed door.
    */
    target.addEventListener(
      'click',
      (event) => {
        if (
          isImmersiveXRScene(
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


        this.closeOpenDoor();
      }
    );


    this.el.sceneEl.appendChild(
      target
    );


    this.closeTarget =
      target;


    this.updateCloseTarget();
  },


  /* ========================================================
     DEFAULT DOOR PART
  ======================================================== */

  activateDefaultPart:
    function () {

      if (!this.parts.length) {
        return false;
      }


      return this.activatePart(
        this.parts[0]
      );
    },


  /* ========================================================
     FIND WHICH DOOR PART WAS CLICKED
  ======================================================== */

  findPartFromHit:
    function (hitObject) {

      let current =
        hitObject;


      while (current) {

        /*
          If this mesh already belongs to
          a door state, return that door.
        */
        if (
          current.userData &&
          current.userData
            .doorPartState
        ) {
          return current
            .userData
            .doorPartState
            .part;
        }


        /*
          Exact door part.
        */
        if (
          this.parts.includes(
            current
          )
        ) {
          return current;
        }


        /*
          Stop once we reach the root GLB.
        */
        if (
          current ===
          this.root
        ) {
          break;
        }


        current =
          current.parent;
      }


      /*
        If there is only one door part,
        safely use it.
      */
      return (
        this.parts.length === 1
          ? this.parts[0]
          : null
      );
    },


  /* ========================================================
     GET BOUNDING BOX OF ONE DOOR PART
  ======================================================== */

  getLocalBoundingBox:
    function (part) {

      const box =
        new THREE.Box3();


      box.makeEmpty();


      this.el.object3D
        .updateMatrixWorld(
          true
        );


      part.updateMatrixWorld(
        true
      );


      const inverseEntityWorld =
        new THREE.Matrix4()
          .copy(
            this.el.object3D
              .matrixWorld
          )
          .invert();


      part.traverse(
        (node) => {

          if (
            !node.isMesh ||
            !node.geometry
          ) {
            return;
          }


          if (
            !node.geometry
              .boundingBox
          ) {
            node.geometry
              .computeBoundingBox();
          }


          if (
            !node.geometry
              .boundingBox
          ) {
            return;
          }


          const nodeToEntity =
            new THREE.Matrix4()
              .multiplyMatrices(
                inverseEntityWorld,
                node.matrixWorld
              );


          const nodeBox =
            node.geometry
              .boundingBox
              .clone()
              .applyMatrix4(
                nodeToEntity
              );


          box.union(
            nodeBox
          );
        }
      );


      return box;
    },


  /* ========================================================
     CREATE HINGE STATE FOR ONE DOOR
  ======================================================== */

  createState:
    function (part) {

      /*
        If this door already has a hinge,
        reuse it.
      */
      if (
        this.partStates.has(
          part
        )
      ) {
        return this.partStates.get(
          part
        );
      }


      const box =
        this.getLocalBoundingBox(
          part
        );


      if (box.isEmpty()) {
        return null;
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
        Work out whether the door is wider
        across X or Z.
      */
      const widthRunsAlongX =
        size.x >= size.z;


      const hingePosition =
        center.clone();


      /*
        Put hinge on selected side.
      */
      if (widthRunsAlongX) {

        hingePosition.x =
          this.data.hingeSide ===
          'left'
            ? box.min.x
            : box.max.x;

      } else {

        hingePosition.z =
          this.data.hingeSide ===
          'left'
            ? box.min.z
            : box.max.z;
      }


      /*
        THREE.js pivot group.
      */
      const pivot =
        new THREE.Group();


      pivot.name =
        'individual-door-hinge';


      pivot.position.copy(
        hingePosition
      );


      /*
        Add hinge to A-Frame door entity.
      */
      this.el.object3D.add(
        pivot
      );


      /*
        Reparent the actual door part under
        the hinge while keeping its world
        transform.
      */
      pivot.attach(
        part
      );


      /*
        Every door part keeps its own
        open/closed state.
      */
      const state = {
        part: part,

        pivot: pivot,

        isOpen: false,

        currentAngle: 0,

        startAngle: 0,

        targetAngle: 0,

        animationTime: 0,

        isAnimating: false
      };


      part.userData
        .doorPartState =
        state;


      this.partStates.set(
        part,
        state
      );


      return state;
    },


  /* ========================================================
     START OPEN/CLOSE ANIMATION
  ======================================================== */

  startDoorAnimation:
    function (
      state,
      shouldOpen
    ) {

      /*
        Remember whether the door is
        supposed to be open.
      */
      state.isOpen =
        shouldOpen;


      state.startAngle =
        state.currentAngle;


      /*
        Opening:
          go to 100 degrees.

        Closing:
          go back to 0 degrees.
      */
      const targetDegrees =
        shouldOpen
          ? this.data.openAngle *
            this.data.direction
          : 0;


      state.targetAngle =
        THREE.MathUtils
          .degToRad(
            targetDegrees
          );


      state.animationTime = 0;

      state.isAnimating =
        true;


      /*
        Enable or disable the small
        close target depending on
        door state.
      */
      this.updateCloseTarget();
    },


  /* ========================================================
     CLICK / ACTIVATE A SPECIFIC DOOR
  ======================================================== */

  activatePart:
    function (hitObject) {

      const now =
        performance.now();


      /*
        Prevent accidental double activation
        from one physical click.
      */
      if (
        now -
        this.lastActivation <
        250
      ) {
        return false;
      }


      const part =
        this.findPartFromHit(
          hitObject
        );


      if (!part) {
        return false;
      }


      const state =
        this.createState(
          part
        );


      if (!state) {
        return false;
      }


      this.lastActivation =
        now;


      this.lastActiveState =
        state;


      /*
        THIS IS THE REPEATED TOGGLE:

        closed → open
        open → closed
        closed → open
        etc.
      */
      this.startDoorAnimation(
        state,
        !state.isOpen
      );


      return true;
    },


  /* ========================================================
     FIND AN OPEN DOOR
  ======================================================== */

  getOpenState:
    function () {

      /*
        Prefer the most recently used door.
      */
      if (
        this.lastActiveState &&
        this.lastActiveState
          .isOpen
      ) {
        return this.lastActiveState;
      }


      let openState =
        null;


      /*
        Otherwise find any open door.
      */
      this.partStates.forEach(
        (state) => {

          if (
            !openState &&
            state.isOpen
          ) {
            openState =
              state;
          }
        }
      );


      return openState;
    },


  /* ========================================================
     RELIABLE CLOSE FUNCTION

     Used by the small invisible
     doorway target.
  ======================================================== */

  closeOpenDoor:
    function () {

      const state =
        this.getOpenState();


      if (!state) {
        return false;
      }


      const now =
        performance.now();


      if (
        now -
        this.lastActivation <
        250
      ) {
        return false;
      }


      this.lastActivation =
        now;


      this.lastActiveState =
        state;


      /*
        Always close.
      */
      this.startDoorAnimation(
        state,
        false
      );


      return true;
    },


  /* ========================================================
     TOGGLE MOST RECENT DOOR

     Preserved for other systems such
     as the story manager.
  ======================================================== */

  toggleLastDoor:
    function () {

      const state =
        this.lastActiveState;


      if (!state) {
        return false;
      }


      const now =
        performance.now();


      if (
        now -
        this.lastActivation <
        250
      ) {
        return false;
      }


      this.lastActivation =
        now;


      this.startDoorAnimation(
        state,
        !state.isOpen
      );


      return true;
    },


  /* ========================================================
     SHOW CLOSE TARGET ONLY WHILE
     A DOOR IS OPEN
  ======================================================== */

  updateCloseTarget:
    function () {

      if (!this.closeTarget) {
        return;
      }


      this.closeTarget
        .setAttribute(
          'visible',
          Boolean(
            this.getOpenState()
          )
        );
    },


  /* ========================================================
     SMOOTH DOOR EASING
  ======================================================== */

  easeInOut:
    function (value) {

      return (
        value < 0.5

          ? 2 *
            value *
            value

          : 1 -
            Math.pow(
              -2 * value + 2,
              2
            ) / 2
      );
    },


  /* ========================================================
     RUN DOOR ANIMATION
  ======================================================== */

  tick:
    function (
      time,
      deltaTime
    ) {

      if (!deltaTime) {
        return;
      }


      this.partStates.forEach(
        (state) => {

          if (
            !state.isAnimating
          ) {
            return;
          }


          state.animationTime +=
            deltaTime;


          const progress =
            Math.min(
              state.animationTime /
              this.data.duration,
              1
            );


          const eased =
            this.easeInOut(
              progress
            );


          state.currentAngle =
            THREE.MathUtils.lerp(
              state.startAngle,
              state.targetAngle,
              eased
            );


          state.pivot.rotation.y =
            state.currentAngle;


          if (
            progress >= 1
          ) {

            state.currentAngle =
              state.targetAngle;


            state.pivot.rotation.y =
              state.targetAngle;


            state.isAnimating =
              false;
          }
        }
      );
    }
});


/* ============================================================
   QUEST / VR DOOR INTERACTION

   Right trigger + controller ray.
============================================================ */

AFRAME.registerComponent(
  'vr-door-interactor',
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


      this.lastTriggerTime =
        0;


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

        if (this.triggerHeld) {
          return;
        }


        if (
          event &&
          event.stopPropagation
        ) {
          event.stopPropagation();
        }


        const now =
          performance.now();


        if (
          now -
          this.lastTriggerTime <
          250
        ) {
          return;
        }


        this.triggerHeld =
          true;


        this.lastTriggerTime =
          now;


        this.useDoor();
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


    /* ======================================================
       QUEST DOOR RAYCAST
    ====================================================== */

    useDoor:
      function () {

        const raycaster =
          this.el.components
            .raycaster;


        const door =
          document.querySelector(
            '#door'
          );


        const closeTarget =
          document.querySelector(
            '#doorCloseTarget'
          );


        if (
          !raycaster ||
          !door
        ) {
          return;
        }


        const doorComponent =
          door.components[
            'door-hinge'
          ];


        if (!doorComponent) {
          return;
        }


        /*
          Refresh because doorCloseTarget is
          dynamically added after the GLB loads.
        */
        if (
          raycaster.refreshObjects
        ) {
          raycaster
            .refreshObjects();
        }


        /*
          FIRST:
          check the close-only target.
        */
        const closeIntersection =
          closeTarget &&
          raycaster.getIntersection
            ? raycaster
                .getIntersection(
                  closeTarget
                )
            : null;


        if (
          closeIntersection
        ) {

          doorComponent
            .closeOpenDoor();

          return;
        }


        /*
          SECOND:
          check actual visible door.
        */
        const doorIntersection =
          raycaster.getIntersection
            ? raycaster
                .getIntersection(
                  door
                )
            : null;


        if (
          !doorIntersection
        ) {
          return;
        }


        /*
          Open/close the exact internal
          door part hit by the laser.
        */
        if (
          doorComponent
            .activatePart(
              doorIntersection.object
            )
        ) {
          return;
        }


        /*
          Fallback ONLY after the visible
          door itself was genuinely hit.

          Unlike the old code, looking beside
          the door does not activate this.
        */
        doorComponent
          .activateDefaultPart();
      }
  }
);


/* ============================================================
   NATURAL GRAB SYSTEM

   teddy.glb
   hairpin.glb
   future clue objects
============================================================ */

AFRAME.registerComponent(
  'natural-grabbable',
  {

    schema: {

      gravity: {
        default: -9.8
      },

      floorY: {
        default: 0.015
      },

      throwMultiplier: {
        default: 1.0
      },

      maxThrowSpeed: {
        default: 6
      }
    },


    init: function () {

      this.heldBy =
        null;


      this.velocity =
        new THREE.Vector3();


      this.isMoving =
        false;


      this.lastSurfaceCheck =
        0;


      this.dropRay =
        new THREE.Raycaster();


      this.dropRay.far =
        2.5;


      this.cachedRoomMeshes =
        [];


      this.roomMeshCacheTime =
        0;


      /*
        MAC CLICK PICKUP

        Again: block mouse interaction only
        during a REAL immersive headset
        session.

        Mac fullscreen remains interactive.
      */
      this.el.addEventListener(
        'click',
        () => {

          if (
            isImmersiveXRScene(
              this.el.sceneEl
            )
          ) {
            return;
          }


          const desktopHold =
            document.querySelector(
              '#desktopHold'
            );


          if (!desktopHold) {
            return;
          }


          /*
            Click held object again:
            release it.

            Click unheld object:
            pick it up.
          */
          if (this.heldBy) {

            this.release(
              new THREE.Vector3()
            );

          } else {

            this.grab(
              desktopHold
            );
          }
        }
      );
    },


  /* ========================================================
     GET WORLD BOUNDING BOX
  ======================================================== */

    getWorldBox:
      function () {

        const model =
          this.el.getObject3D(
            'mesh'
          ) ||
          this.el.object3D;


        model.updateMatrixWorld(
          true
        );


        return (
          new THREE.Box3()
            .setFromObject(
              model
            )
        );
      },


  /* ========================================================
     DISTANCE FROM HAND TO OBJECT
  ======================================================== */

    distanceToPoint:
      function (
        worldPoint
      ) {

        const box =
          this.getWorldBox();


        if (box.isEmpty()) {
          return Infinity;
        }


        const closest =
          worldPoint
            .clone()
            .clamp(
              box.min,
              box.max
            );


        return (
          closest.distanceTo(
            worldPoint
          )
        );
      },


  /* ========================================================
     MOVE OBJECT BETWEEN PARENTS
     WITHOUT TELEPORTING IT
  ======================================================== */

    reparentPreserveWorld:
      function (
        newParentObject3D
      ) {

        newParentObject3D
          .updateMatrixWorld(
            true
          );


        newParentObject3D.attach(
          this.el.object3D
        );
      },


  /* ========================================================
     GRAB
  ======================================================== */

    grab:
      function (
        handEntity
      ) {

        if (this.heldBy) {
          return false;
        }


        this.isMoving =
          false;


        this.velocity.set(
          0,
          0,
          0
        );


        this.heldBy =
          handEntity;


        this.reparentPreserveWorld(
          handEntity.object3D
        );


        /*
          story.js listens for this state
          when an object has class="clue".
        */
        this.el.addState(
          'grabbed'
        );


        console.log(
          this.el.id,
          'grabbed by',
          handEntity.id
        );


        return true;
      },


  /* ========================================================
     RELEASE / THROW
  ======================================================== */

    release:
      function (
        controllerVelocity
      ) {

        if (!this.heldBy) {
          return;
        }


        const scene =
          this.el.sceneEl;


        /*
          Return object to the main scene.
        */
        this.reparentPreserveWorld(
          scene.object3D
        );


        this.heldBy =
          null;


        this.el.removeState(
          'grabbed'
        );


        this.velocity.copy(
          controllerVelocity ||
          new THREE.Vector3()
        );


        this.velocity.multiplyScalar(
          this.data
            .throwMultiplier
        );


        this.velocity.clampLength(
          0,
          this.data
            .maxThrowSpeed
        );


        /*
          Very slow release:
          try settling it immediately
          on nearby furniture/floor.
        */
        if (
          this.velocity.length() <
          0.22
        ) {

          const settled =
            this.settleOnNearbySurface(
              0.45
            );


          this.isMoving =
            !settled;

        } else {

          this.isMoving =
            true;
        }
      },


  /* ========================================================
     CACHE ROOM MESHES
  ======================================================== */

    getRoomMeshes:
      function () {

        const now =
          performance.now();


        if (
          this.cachedRoomMeshes
            .length &&
          now -
          this.roomMeshCacheTime <
          5000
        ) {
          return (
            this.cachedRoomMeshes
          );
        }


        const meshes =
          [];


        this.el.sceneEl
          .querySelectorAll(
            '.roompart'
          )
          .forEach(
            (entity) => {

              const root =
                entity
                  .getObject3D(
                    'mesh'
                  );


              if (!root) {
                return;
              }


              root.updateMatrixWorld(
                true
              );


              root.traverse(
                (node) => {

                  if (
                    node.isMesh
                  ) {
                    meshes.push(
                      node
                    );
                  }
                }
              );
            }
          );


        this.cachedRoomMeshes =
          meshes;


        this.roomMeshCacheTime =
          now;


        return (
          this.cachedRoomMeshes
        );
      },


  /* ========================================================
     PLACE DROPPED ITEM ON A NEARBY SURFACE
  ======================================================== */

    settleOnNearbySurface:
      function (
        maximumDistance
      ) {

        const roomMeshes =
          this.getRoomMeshes();


        if (
          !roomMeshes.length
        ) {
          return false;
        }


        const box =
          this.getWorldBox();


        if (box.isEmpty()) {
          return false;
        }


        const center =
          new THREE.Vector3();


        box.getCenter(
          center
        );


        /*
          Cast downward from slightly above
          the bottom of the object's box.
        */
        const origin =
          new THREE.Vector3(
            center.x,
            box.min.y + 0.08,
            center.z
          );


        this.dropRay.set(
          origin,
          new THREE.Vector3(
            0,
            -1,
            0
          )
        );


        this.dropRay.far =
          maximumDistance +
          0.08;


        const hit =
          this.dropRay
            .intersectObjects(
              roomMeshes,
              true
            )[0];


        if (!hit) {
          return false;
        }


        const gap =
          box.min.y -
          hit.point.y;


        if (
          gap < -0.03 ||
          gap >
          maximumDistance
        ) {
          return false;
        }


        /*
          Move object so its bottom sits
          slightly above the surface.
        */
        this.el.object3D
          .position.y +=
          hit.point.y -
          box.min.y +
          0.012;


        this.velocity.set(
          0,
          0,
          0
        );


        return true;
      },


  /* ========================================================
     SIMPLE THROW / GRAVITY PHYSICS
  ======================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {

        if (
          this.heldBy ||
          !this.isMoving ||
          !deltaTime
        ) {
          return;
        }


        const dt =
          Math.min(
            deltaTime / 1000,
            0.04
          );


        /*
          Gravity.
        */
        this.velocity.y +=
          this.data.gravity *
          dt;


        /*
          Movement.
        */
        this.el.object3D
          .position
          .addScaledVector(
            this.velocity,
            dt
          );


        /*
          Air damping.
        */
        const damping =
          Math.pow(
            0.985,
            dt * 60
          );


        this.velocity.x *=
          damping;


        this.velocity.z *=
          damping;


        this.el.object3D
          .updateMatrixWorld(
            true
          );


        const box =
          this.getWorldBox();


        /*
          Basic fallback floor.
        */
        if (!box.isEmpty()) {

          const floorPenetration =
            this.data.floorY -
            box.min.y;


          if (
            floorPenetration >
            0
          ) {

            this.el.object3D
              .position.y +=
              floorPenetration;


            /*
              Small bounce for stronger throws.
            */
            if (
              Math.abs(
                this.velocity.y
              ) > 0.8
            ) {

              this.velocity.y *=
                -0.12;


              this.velocity.x *=
                0.72;


              this.velocity.z *=
                0.72;

            } else {

              this.velocity.set(
                0,
                0,
                0
              );


              this.isMoving =
                false;
            }
          }
        }


        /*
          While falling, occasionally look
          for furniture/surfaces.
        */
        if (
          this.isMoving &&
          this.velocity.y <= 0 &&
          time -
          this.lastSurfaceCheck >
          120
        ) {

          this.lastSurfaceCheck =
            time;


          if (
            this.settleOnNearbySurface(
              0.12
            )
          ) {
            this.isMoving =
              false;
          }
        }
      }
  }
);


/* ============================================================
   VR HAND GRABBING
============================================================ */

AFRAME.registerComponent(
  'natural-grab-hand',
  {

    schema: {

      radius: {
        default: 0.4
      },

      velocitySmoothing: {
        default: 0.35
      },

      gripThreshold: {
        default: 0.5
      }
    },


    init: function () {

      this.heldItem =
        null;


      this.previousPosition =
        new THREE.Vector3();


      this.currentPosition =
        new THREE.Vector3();


      this.smoothedVelocity =
        new THREE.Vector3();


      this.instantVelocity =
        new THREE.Vector3();


      this.hasPreviousPosition =
        false;


      this.gripHeld =
        false;


      this.analogGripHeld =
        false;


      this.beginGrip =
        this.beginGrip
          .bind(this);


      this.endGrip =
        this.endGrip
          .bind(this);


      this.onGripChanged =
        this.onGripChanged
          .bind(this);


      /*
        Meta Quest grip events.
      */
      this.el.addEventListener(
        'gripdown',
        this.beginGrip
      );


      this.el.addEventListener(
        'squeezestart',
        this.beginGrip
      );


      this.el.addEventListener(
        'gripup',
        this.endGrip
      );


      this.el.addEventListener(
        'squeezeend',
        this.endGrip
      );


      this.el.addEventListener(
        'gripchanged',
        this.onGripChanged
      );


      /*
        Additional controller buttons
        as fallback pickup controls.
      */
      this.el.addEventListener(
        'abuttondown',
        this.beginGrip
      );


      this.el.addEventListener(
        'abuttonup',
        this.endGrip
      );


      this.el.addEventListener(
        'xbuttondown',
        this.beginGrip
      );


      this.el.addEventListener(
        'xbuttonup',
        this.endGrip
      );


      this.el.addEventListener(
        'controllerdisconnected',
        this.endGrip
      );
    },


  /* ========================================================
     ANALOG GRIP
  ======================================================== */

    onGripChanged:
      function (event) {

        const value =
          event &&
          event.detail &&
          typeof event.detail.value ===
            'number'

            ? event.detail.value

            : (
                event &&
                typeof event.detail ===
                  'number'

                  ? event.detail

                  : null
              );


        if (value === null) {
          return;
        }


        const isPressed =
          value >=
          this.data
            .gripThreshold;


        if (
          isPressed &&
          !this.analogGripHeld
        ) {

          this.analogGripHeld =
            true;


          this.beginGrip();

        } else if (
          !isPressed &&
          this.analogGripHeld
        ) {

          this.analogGripHeld =
            false;


          this.endGrip();
        }
      },


  /* ========================================================
     START GRIP
  ======================================================== */

    beginGrip:
      function () {

        if (this.gripHeld) {
          return;
        }


        this.gripHeld =
          true;


        this.grabNearest();
      },


  /* ========================================================
     RELEASE GRIP
  ======================================================== */

    endGrip:
      function () {

        if (
          !this.gripHeld &&
          !this.heldItem
        ) {
          return;
        }


        this.gripHeld =
          false;


        this.releaseHeld();
      },


  /* ========================================================
     FIND NEAREST GRABBABLE OBJECT
  ======================================================== */

    findNearest:
      function () {

        const handPosition =
          new THREE.Vector3();


        this.el.object3D
          .getWorldPosition(
            handPosition
          );


        let nearest =
          null;


        let nearestEl =
          null;


        let nearestDistance =
          Infinity;


        this.el.sceneEl
          .querySelectorAll(
            '[natural-grabbable]'
          )
          .forEach(
            (entity) => {

              const component =
                entity.components[
                  'natural-grabbable'
                ];


              if (
                !component ||
                component.heldBy
              ) {
                return;
              }


              const distance =
                component
                  .distanceToPoint(
                    handPosition
                  );


              if (
                distance <
                nearestDistance
              ) {

                nearest =
                  component;


                nearestEl =
                  entity;


                nearestDistance =
                  distance;
              }
            }
          );


        return {
          nearest: nearest,

          nearestEl:
            nearestEl,

          nearestDistance:
            nearestDistance
        };
      },


  /* ========================================================
     GRAB NEAREST
  ======================================================== */

    grabNearest:
      function () {

        if (this.heldItem) {
          return;
        }


        const {
          nearest,
          nearestEl,
          nearestDistance
        } =
          this.findNearest();


        /*
          Nothing close enough.
        */
        if (
          !nearest ||
          nearestDistance >
          this.data.radius
        ) {

          console.log(
            this.el.id,
            'grip pressed, but no item was close enough. Nearest was',
            nearestEl
              ? nearestEl.id
              : 'none'
          );


          return;
        }


        /*
          Successful grab.
        */
        if (
          nearest.grab(
            this.el
          )
        ) {

          this.heldItem =
            nearest;
        }
      },


  /* ========================================================
     RELEASE HELD OBJECT
  ======================================================== */

    releaseHeld:
      function () {

        if (!this.heldItem) {
          return;
        }


        const released =
          this.heldItem;


        this.heldItem =
          null;


        /*
          Throw using smoothed hand velocity.
        */
        released.release(
          this.smoothedVelocity
            .clone()
        );
      },


  /* ========================================================
     CALCULATE HAND VELOCITY
  ======================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {

        if (!deltaTime) {
          return;
        }


        this.el.object3D
          .getWorldPosition(
            this.currentPosition
          );


        /*
          First frame.
        */
        if (
          !this.hasPreviousPosition
        ) {

          this.previousPosition
            .copy(
              this.currentPosition
            );


          this.hasPreviousPosition =
            true;


          return;
        }


        const seconds =
          deltaTime /
          1000;


        if (seconds > 0) {

          /*
            Raw controller velocity.
          */
          this.instantVelocity
            .subVectors(
              this.currentPosition,
              this.previousPosition
            )
            .divideScalar(
              seconds
            );


          /*
            Smooth the velocity so throws
            do not feel extremely jittery.
          */
          this.smoothedVelocity
            .lerp(
              this.instantVelocity,
              this.data
                .velocitySmoothing
            );


          this.previousPosition
            .copy(
              this.currentPosition
            );
        }
      }
  }
);