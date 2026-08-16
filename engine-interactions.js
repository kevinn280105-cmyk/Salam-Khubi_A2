/* ============================================================
   engine-interactions.js

   Handles:
   - Doors
   - Mac interaction
   - Quest door interaction
   - Interactive TV
   - Quest TV interaction
   - Object pickup / drop / throwing
============================================================ */


/* ============================================================
   REAL IMMERSIVE VR CHECK

   Mac fullscreen should still use mouse/trackpad interaction.

   Only an actual WebXR headset session returns true here.
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
    openAngle: {
      default: 100
    },

    hingeSide: {
      default: 'left',
      oneOf: [
        'left',
        'right'
      ]
    },

    direction: {
      default: 1
    },

    duration: {
      default: 650
    }
  },


  init: function () {
    this.root =
      null;

    this.parts =
      [];

    this.partStates =
      new Map();

    this.lastActivation =
      0;

    this.lastActiveState =
      null;

    this.closeTarget =
      null;


    /* --------------------------------------------------------
       MODEL LOADED
    -------------------------------------------------------- */

    this.el.addEventListener(
      'model-loaded',
      () => {
        this.prepareDoorParts();
        this.createCloseTarget();
      }
    );


    /* --------------------------------------------------------
       EXTERNAL ACTIVATION
    -------------------------------------------------------- */

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


    /* --------------------------------------------------------
       MAC / DESKTOP CLICK

       Do NOT use scene.is('vr-mode') here.

       Mac fullscreen must still be clickable.
    -------------------------------------------------------- */

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


        if (
          hitObject &&
          this.activatePart(
            hitObject
          )
        ) {
          return;
        }


        /*
          If an open door has swung away,
          clicking the doorway can close it
          through #doorCloseTarget.
        */
        this.closeOpenDoor();
      }
    );
  },


  /* ========================================================
     DOES THIS OBJECT CONTAIN A MESH?
  ======================================================== */

  hasMeshDescendant:
    function (object) {

      let found =
        false;


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
     FIND INDIVIDUAL DOOR PARTS

     Keeps support for separate doors inside cua.glb.
  ======================================================== */

  prepareDoorParts:
    function () {

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
        Move through unnecessary wrapper groups.
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
        Treat each meaningful child as an
        independently selectable door part.
      */
      this.parts =
        container.children.filter(
          (child) =>
            this.hasMeshDescendant(
              child
            )
        );


      /*
        Fallback for a single-mesh door.
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

     Replaces the old giant invisible door target.

     It can close an open door.

     It cannot open a closed door.
  ======================================================== */

  createCloseTarget:
    function () {

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
        Small interaction area in the
        original doorway.
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


      target.setAttribute(
        'material',
        'opacity: 0; transparent: true; depthWrite: false; side: double'
      );


      /*
        Disabled when doors are closed.
      */
      target.setAttribute(
        'visible',
        false
      );


      /* ------------------------------------------------------
         MAC CLOSE
      ------------------------------------------------------ */

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
     DEFAULT DOOR
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
     FIND DOOR PART FROM RAYCAST HIT
  ======================================================== */

  findPartFromHit:
    function (hitObject) {

      let current =
        hitObject;


      while (current) {

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


        if (
          this.parts.includes(
            current
          )
        ) {
          return current;
        }


        if (
          current ===
          this.root
        ) {
          break;
        }


        current =
          current.parent;
      }


      return (
        this.parts.length === 1
          ? this.parts[0]
          : null
      );
    },


  /* ========================================================
     LOCAL BOUNDING BOX
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
     CREATE DOOR HINGE
  ======================================================== */

  createState:
    function (part) {

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


      const widthRunsAlongX =
        size.x >=
        size.z;


      const hingePosition =
        center.clone();


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


      const pivot =
        new THREE.Group();


      pivot.name =
        'individual-door-hinge';


      pivot.position.copy(
        hingePosition
      );


      this.el.object3D.add(
        pivot
      );


      /*
        Reparent while preserving world transform.
      */
      pivot.attach(
        part
      );


      const state = {
        part:
          part,

        pivot:
          pivot,

        isOpen:
          false,

        currentAngle:
          0,

        startAngle:
          0,

        targetAngle:
          0,

        animationTime:
          0,

        isAnimating:
          false
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
     START OPEN / CLOSE ANIMATION
  ======================================================== */

  startDoorAnimation:
    function (
      state,
      shouldOpen
    ) {

      state.isOpen =
        shouldOpen;


      state.startAngle =
        state.currentAngle;


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


      state.animationTime =
        0;


      state.isAnimating =
        true;


      this.updateCloseTarget();
    },


  /* ========================================================
     ACTIVATE SPECIFIC DOOR PART
  ======================================================== */

  activatePart:
    function (hitObject) {

      const now =
        performance.now();


      /*
        Prevent one physical click/trigger
        from activating twice.
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
        Repeating toggle:

        closed → open
        open → closed
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

      if (
        this.lastActiveState &&
        this.lastActiveState
          .isOpen
      ) {

        return this.lastActiveState;
      }


      let openState =
        null;


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
     CLOSE OPEN DOOR
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


      this.startDoorAnimation(
        state,
        false
      );


      return true;
    },


  /* ========================================================
     TOGGLE LAST DOOR

     Kept for later story interaction.
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
     SHOW SMALL CLOSE TARGET ONLY WHILE
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
     DOOR EASING
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
     DOOR ANIMATION LOOP
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
   QUEST DOOR INTERACTION

   Right-hand laser + trigger.
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


        if (
          raycaster.refreshObjects
        ) {

          raycaster
            .refreshObjects();
        }


        /* --------------------------------------------------
           CLOSE TARGET FIRST
        -------------------------------------------------- */

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


        /* --------------------------------------------------
           ACTUAL DOOR
        -------------------------------------------------- */

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


        if (
          doorComponent
            .activatePart(
              doorIntersection
                .object
            )
        ) {

          return;
        }


        /*
          Fallback only after the visible
          door was actually hit.
        */
        doorComponent
          .activateDefaultPart();
      }
  }
);


/* ============================================================
   INTERACTIVE TV

   OFF:
   - black screen
   - no emissive glow
   - room glow light off
   - static audio off

   ON:
   - screen glows
   - screen brightness flickers
   - nearby room gets pale TV light
   - TV static plays
============================================================ */

AFRAME.registerComponent(
  'tv-toggle',
  {

    schema: {

      glowLight: {
        type: 'selector'
      }
    },


    init: function () {

      /*
        TV begins OFF.
      */
      this.isOn =
        false;


      this.lastFlickerTime =
        0;


      /* ------------------------------------------------------
         MAC / DESKTOP CLICK
      ------------------------------------------------------ */

      this.el.addEventListener(
        'click',
        (event) => {

          /*
            Quest uses vr-tv-interactor.

            Mac fullscreen must still work.
          */
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


          this.toggle();
        }
      );


      /*
        Make sure screen starts black.
      */
      this.applyVisualState();
    },


    /* ======================================================
       TOGGLE
    ====================================================== */

    toggle:
      function () {

        this.setState(
          !this.isOn
        );
      },


    /* ======================================================
       SET EXACT TV STATE

       This lets story.js control the TV later.

       Example:

       tv.components['tv-toggle']
         .setState(true);

       That can make the TV turn itself on
       after the incense blackout.
    ====================================================== */

    setState:
      function (
        shouldBeOn
      ) {

        this.isOn =
          Boolean(
            shouldBeOn
          );


        this.applyVisualState();


        /* --------------------------------------------------
           AUDIO.JS

           Start or stop the static.
        -------------------------------------------------- */

        if (
          window.setRoomsTVState
        ) {

          window.setRoomsTVState(
            this.isOn
          );
        }


        /* --------------------------------------------------
           CLEAN STORY EVENT

           Other systems can listen for:

           tv-state-changed
        -------------------------------------------------- */

        this.el.emit(
          'tv-state-changed',

          {
            isOn:
              this.isOn
          },

          false
        );


        console.log(
          this.isOn

            ? 'TV turned ON.'

            : 'TV turned OFF.'
        );
      },


    /* ======================================================
       SCREEN + ROOM LIGHT
    ====================================================== */

    applyVisualState:
      function () {

        /* --------------------------------------------------
           TV ON
        -------------------------------------------------- */

        if (this.isOn) {

          /*
            Screen itself becomes pale grey-blue.
          */
          this.el.setAttribute(
            'material',
            'color',
            '#a9bdc8'
          );


          /*
            Emissive makes the screen look
            self-illuminated.
          */
          this.el.setAttribute(
            'material',
            'emissive',
            '#d8efff'
          );


          this.el.setAttribute(
            'material',
            'emissiveIntensity',
            2.2
          );


          /*
            Actual point light lights nearby
            walls/furniture.
          */
          if (
            this.data.glowLight
          ) {

            this.data.glowLight
              .setAttribute(
                'light',
                'intensity',
                2.2
              );
          }


        /* --------------------------------------------------
           TV OFF
        -------------------------------------------------- */

        } else {

          this.el.setAttribute(
            'material',
            'color',
            '#050505'
          );


          this.el.setAttribute(
            'material',
            'emissive',
            '#000000'
          );


          this.el.setAttribute(
            'material',
            'emissiveIntensity',
            0
          );


          if (
            this.data.glowLight
          ) {

            this.data.glowLight
              .setAttribute(
                'light',
                'intensity',
                0
              );
          }
        }
      },


    /* ======================================================
       OLD-TV SCREEN FLICKER

       Only while TV is ON.
    ====================================================== */

    tick:
      function (time) {

        if (!this.isOn) {
          return;
        }


        /*
          Change roughly every 80ms instead
          of every rendered frame.
        */
        if (
          time -
          this.lastFlickerTime <
          80
        ) {
          return;
        }


        this.lastFlickerTime =
          time;


        /*
          Random subtle screen brightness.
        */
        const screenBrightness =
          1.7 +
          Math.random() *
          1.1;


        this.el.setAttribute(
          'material',
          'emissiveIntensity',
          screenBrightness
        );


        /*
          The room illumination also changes
          slightly with the TV screen.
        */
        if (
          this.data.glowLight
        ) {

          const roomGlow =
            1.6 +
            Math.random() *
            0.9;


          this.data.glowLight
            .setAttribute(
              'light',
              'intensity',
              roomGlow
            );
        }
      }
  }
);


/* ============================================================
   QUEST TV INTERACTION

   Point the RIGHT controller laser at the TV.

   Press trigger:

   OFF → ON
   ON → OFF
============================================================ */

AFRAME.registerComponent(
  'vr-tv-interactor',
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
          One physical press =
          one TV toggle.
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


        const screen =
          document.querySelector(
            '#tvScreen'
          );


        if (
          !raycaster ||
          !screen
        ) {
          return;
        }


        if (
          raycaster.refreshObjects
        ) {

          raycaster
            .refreshObjects();
        }


        /*
          Is controller laser actually
          touching the TV?
        */
        const intersection =
          raycaster.getIntersection

            ? raycaster
                .getIntersection(
                  screen
                )

            : null;


        if (
          !intersection
        ) {
          return;
        }


        const tv =
          screen.components[
            'tv-toggle'
          ];


        if (tv) {

          tv.toggle();
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
   NATURAL GRABBABLE OBJECT

   Used by:
   - teddy
   - later incense
   - future clue objects
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


      /* ------------------------------------------------------
         MAC PICKUP
      ------------------------------------------------------ */

      this.el.addEventListener(
        'click',
        () => {

          /*
            Don't run Mac pickup in actual
            immersive Quest VR.
          */
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


          if (this.heldBy) {

            /*
              Click held object again:
              put it down.
            */
            this.release(
              new THREE.Vector3()
            );


          } else {

            /*
              Pick it up.
            */
            this.grab(
              desktopHold
            );
          }
        }
      );
    },


    /* ======================================================
       GET OBJECT BOUNDING BOX
    ====================================================== */

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


    /* ======================================================
       DISTANCE FROM HAND TO OBJECT
    ====================================================== */

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


        return closest
          .distanceTo(
            worldPoint
          );
      },


    /* ======================================================
       REPARENT WITHOUT MOVING OBJECT
    ====================================================== */

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


    /* ======================================================
       GRAB OBJECT
    ====================================================== */

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
          story.js detects this state
          on objects with class="clue".
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


    /* ======================================================
       RELEASE / THROW
    ====================================================== */

    release:
      function (
        controllerVelocity
      ) {

        if (!this.heldBy) {
          return;
        }


        const scene =
          this.el.sceneEl;


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


        this.velocity
          .multiplyScalar(
            this.data
              .throwMultiplier
          );


        this.velocity
          .clampLength(
            0,
            this.data
              .maxThrowSpeed
          );


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


        console.log(
          this.el.id,
          'released at speed',
          this.velocity
            .length()
            .toFixed(2)
        );
      },


    /* ======================================================
       GET ROOM SURFACE MESHES
    ====================================================== */

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
                entity.getObject3D(
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


    /* ======================================================
       SETTLE OBJECT ON A SURFACE
    ====================================================== */

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


    /* ======================================================
       GRAVITY / SIMPLE THROW PHYSICS
    ====================================================== */

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
          Move object.
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


        /* --------------------------------------------------
           FALLBACK FLOOR
        -------------------------------------------------- */

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
              Small bounce after a stronger throw.
            */
            if (
              Math.abs(
                this.velocity.y
              ) >
              0.8
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


        /* --------------------------------------------------
           FURNITURE / SURFACE SETTLING
        -------------------------------------------------- */

        if (
          this.isMoving &&

          this.velocity.y <=
            0 &&

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
   QUEST NATURAL GRAB

   Grip controller near teddy/clue/etc.
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
        this.beginGrip.bind(
          this
        );


      this.endGrip =
        this.endGrip.bind(
          this
        );


      this.onGripChanged =
        this.onGripChanged.bind(
          this
        );


      /* ------------------------------------------------------
         QUEST GRIP EVENTS
      ------------------------------------------------------ */

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
        Controller-button fallbacks.
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


    /* ======================================================
       ANALOG GRIP
    ====================================================== */

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


        if (
          value === null
        ) {
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


    /* ======================================================
       BEGIN GRAB
    ====================================================== */

    beginGrip:
      function () {

        if (
          this.gripHeld
        ) {
          return;
        }


        this.gripHeld =
          true;


        this.grabNearest();
      },


    /* ======================================================
       END GRAB
    ====================================================== */

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


    /* ======================================================
       FIND NEAREST GRABBABLE
    ====================================================== */

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
          nearest:
            nearest,

          nearestEl:
            nearestEl,

          nearestDistance:
            nearestDistance
        };
      },


    /* ======================================================
       GRAB NEAREST
    ====================================================== */

    grabNearest:
      function () {

        if (
          this.heldItem
        ) {
          return;
        }


        const {
          nearest,
          nearestEl,
          nearestDistance
        } =
          this.findNearest();


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


        if (
          nearest.grab(
            this.el
          )
        ) {

          this.heldItem =
            nearest;
        }
      },


    /* ======================================================
       RELEASE HELD ITEM
    ====================================================== */

    releaseHeld:
      function () {

        if (
          !this.heldItem
        ) {
          return;
        }


        const released =
          this.heldItem;


        this.heldItem =
          null;


        released.release(
          this.smoothedVelocity
            .clone()
        );
      },


    /* ======================================================
       CALCULATE HAND VELOCITY FOR THROWING
    ====================================================== */

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


        if (
          seconds > 0
        ) {

          this.instantVelocity
            .subVectors(
              this.currentPosition,
              this.previousPosition
            )
            .divideScalar(
              seconds
            );


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