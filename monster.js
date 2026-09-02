/* ============================================================
   monster.js — ROOMS WITHIN
   BEDROOM / TEDDY WALKING MONSTER EVENT

   EVENT:
   1. Player enters bedroom.
   2. Player physically grabs Teddy.
   3. Player leaves bedroom.
   4. walking.glb appears.
   5. Its first embedded GLB animation plays once.
   6. When animation finishes, the monster disappears.
   7. This event can only happen once.

   Bedroom detection:
   - Automatically uses #bedroom / bedroomasset.glb.
   - Works with Mac movement.
   - Works with Quest teleport.
   - No manually positioned trigger box required.

   Monster models:
   - walking.glb
   - standing.glb

   Both use position 0 0 0 because the Blender/world placement
   is expected to already be baked into the GLB.
============================================================ */


/* ============================================================
   SETTINGS
============================================================ */

const ROOMS_MONSTER_CONFIG = {
  bedroomSelector:
    '#bedroom',

  playerSelector:
    '#cam',

  teddySelector:
    '#teddy',

  walkingModel:
    'walking.glb',

  standingModel:
    'standing.glb',

  /*
    Slightly shrink the bedroom GLB bounding box.

    This helps stop walls or decorations at the edge of the
    bedroom from counting as "inside" too early.
  */
  bedroomInsetX:
    0.20,

  bedroomInsetZ:
    0.20,

  /*
    Check player position about 10 times per second.
  */
  checkInterval:
    100,

  /*
    If walking.glb has no animation clips, keep it visible
    for this long before hiding it.
  */
  fallbackWalkingDuration:
    3500
};


/* ============================================================
   GLOBAL DEBUG STATE
============================================================ */

window.roomsMonsterState = {
  playerInsideBedroom:
    false,

  hasEnteredBedroom:
    false,

  teddyGrabbed:
    false,

  walkingTriggered:
    false,

  walkingVisible:
    false
};


/* ============================================================
   GET WORLD BOX
============================================================ */

function roomsMonsterGetWorldBox(
  entity
) {
  if (!entity) {
    return null;
  }

  const root =
    entity.getObject3D(
      'mesh'
    );

  if (!root) {
    return null;
  }

  entity.object3D
    .updateMatrixWorld(
      true
    );

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
    return null;
  }

  return box;
}


/* ============================================================
   SHRUNK BEDROOM AREA
============================================================ */

function roomsMonsterGetBedroomBox(
  bedroom
) {
  const box =
    roomsMonsterGetWorldBox(
      bedroom
    );

  if (!box) {
    return null;
  }

  const result =
    box.clone();

  const size =
    result.getSize(
      new THREE.Vector3()
    );

  /*
    Never shrink the box enough to invert it.
  */
  const insetX =
    Math.min(
      ROOMS_MONSTER_CONFIG
        .bedroomInsetX,
      Math.max(
        0,
        size.x * 0.20
      )
    );

  const insetZ =
    Math.min(
      ROOMS_MONSTER_CONFIG
        .bedroomInsetZ,
      Math.max(
        0,
        size.z * 0.20
      )
    );

  result.min.x +=
    insetX;

  result.max.x -=
    insetX;

  result.min.z +=
    insetZ;

  result.max.z -=
    insetZ;

  return result;
}


/* ============================================================
   PLAYER WORLD POSITION
============================================================ */

function roomsMonsterGetPlayerPosition(
  player
) {
  if (!player) {
    return null;
  }

  const position =
    new THREE.Vector3();

  player.object3D
    .getWorldPosition(
      position
    );

  return position;
}


/* ============================================================
   INSIDE BEDROOM TEST
============================================================ */

function roomsMonsterPointInsideBedroom(
  point,
  box
) {
  if (
    !point ||
    !box
  ) {
    return false;
  }

  /*
    Only X and Z matter.

    We intentionally ignore camera height because:
    - Mac camera height can bob.
    - Quest headset height varies by player.
    - Teleport should still work reliably.
  */
  return Boolean(
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}


/* ============================================================
   CREATE MONSTER ENTITY
============================================================ */

function roomsMonsterCreateModel(
  id,
  filename
) {
  let entity =
    document.querySelector(
      `#${id}`
    );

  if (entity) {
    return entity;
  }

  entity =
    document.createElement(
      'a-entity'
    );

  entity.setAttribute(
    'id',
    id
  );

  entity.setAttribute(
    'class',
    'rooms-monster'
  );

  /*
    Keep 0 0 0 because your Blender GLBs are exported
    in the room's world coordinates.
  */
  entity.setAttribute(
    'position',
    '0 0 0'
  );

  entity.setAttribute(
    'rotation',
    '0 0 0'
  );

  entity.setAttribute(
    'visible',
    false
  );

  entity.setAttribute(
    'gltf-model',
    `url(${filename})`
  );

  entity.setAttribute(
    'model-status',
    `name: ${id}`
  );

  const scene =
    document.querySelector(
      'a-scene'
    );

  if (scene) {
    scene.appendChild(
      entity
    );
  }

  return entity;
}


/* ============================================================
   MAIN COMPONENT
============================================================ */

AFRAME.registerComponent(
  'rooms-monster-events',
  {
    init: function () {
      this.scene =
        this.el.sceneEl;

      this.bedroom =
        null;

      this.player =
        null;

      this.teddy =
        null;

      this.walkingMonster =
        null;

      this.standingMonster =
        null;

      this.walkingMixer =
        null;

      this.walkingAction =
        null;

      this.walkingModelRoot =
        null;

      this.walkingFallbackTimer =
        null;

      this.lastCheck =
        0;

      this.wasInsideBedroom =
        null;

      this.removed =
        false;

      this.teddyListenerBound =
        false;

      this.onTeddyStateAdded =
        this.onTeddyStateAdded
          .bind(
            this
          );

      this.onWalkingModelLoaded =
        this.onWalkingModelLoaded
          .bind(
            this
          );

      this.refreshReferences =
        this.refreshReferences
          .bind(
            this
          );

      /*
        Create both monster GLBs now,
        but keep both invisible.
      */
      this.walkingMonster =
        roomsMonsterCreateModel(
          'walkingMonster',
          ROOMS_MONSTER_CONFIG
            .walkingModel
        );

      this.standingMonster =
        roomsMonsterCreateModel(
          'standingMonster',
          ROOMS_MONSTER_CONFIG
            .standingModel
        );

      if (
        this.walkingMonster
      ) {
        this.walkingMonster
          .addEventListener(
            'model-loaded',
            this.onWalkingModelLoaded
          );
      }

      this.refreshReferences();

      /*
        Some GLBs/components finish loading after this JS,
        so retry safely.
      */
      [
        100,
        300,
        700,
        1500,
        3000
      ].forEach(
        (delay) => {
          window.setTimeout(
            this.refreshReferences,
            delay
          );
        }
      );

      /*
        Debug helper.

        In browser console:
        getRoomsMonsterState()
      */
      window.getRoomsMonsterState =
        () => ({
          playerInsideBedroom:
            window.roomsMonsterState
              .playerInsideBedroom,

          hasEnteredBedroom:
            window.roomsMonsterState
              .hasEnteredBedroom,

          teddyGrabbed:
            window.roomsMonsterState
              .teddyGrabbed,

          walkingTriggered:
            window.roomsMonsterState
              .walkingTriggered,

          walkingVisible:
            window.roomsMonsterState
              .walkingVisible
        });

      console.log(
        'Rooms Within monster event ready.'
      );
    },


    /* ======================================================
       FIND PROJECT OBJECTS
    ====================================================== */

    refreshReferences:
      function () {
        this.bedroom =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .bedroomSelector
          );

        this.player =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .playerSelector
          ) ||
          document.querySelector(
            '#rig'
          );

        this.teddy =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .teddySelector
          );

        if (
          this.teddy &&
          !this.teddyListenerBound
        ) {
          this.teddy.addEventListener(
            'stateadded',
            this.onTeddyStateAdded
          );

          this.teddyListenerBound =
            true;
        }

        if (
          !this.walkingMonster
        ) {
          this.walkingMonster =
            document.querySelector(
              '#walkingMonster'
            );
        }

        if (
          !this.standingMonster
        ) {
          this.standingMonster =
            document.querySelector(
              '#standingMonster'
            );
        }
      },


    /* ======================================================
       TEDDY PHYSICAL GRAB
    ====================================================== */

    onTeddyStateAdded:
      function (event) {
        const state =
          event &&
          event.detail
            ? event.detail.state
            : '';

        if (
          state !==
          'grabbed'
        ) {
          return;
        }

        window.roomsMonsterState
          .teddyGrabbed =
            true;

        console.log(
          'Monster event: Teddy was physically grabbed.'
        );

        this.scene.emit(
          'monster-teddy-grabbed',
          {},
          false
        );
      },


    /* ======================================================
       BEDROOM ENTER
    ====================================================== */

    playerEnteredBedroom:
      function () {
        window.roomsMonsterState
          .playerInsideBedroom =
            true;

        window.roomsMonsterState
          .hasEnteredBedroom =
            true;

        console.log(
          'Monster event: player entered bedroom.'
        );

        this.scene.emit(
          'bedroom-entered',
          {},
          false
        );
      },


    /* ======================================================
       BEDROOM EXIT
    ====================================================== */

    playerExitedBedroom:
      function () {
        window.roomsMonsterState
          .playerInsideBedroom =
            false;

        console.log(
          'Monster event: player left bedroom.'
        );

        this.scene.emit(
          'bedroom-exited',
          {},
          false
        );

        /*
          THE SCARE CONDITION

          Must:
          - have genuinely entered bedroom;
          - have physically grabbed Teddy;
          - not have triggered before.
        */
        if (
          window.roomsMonsterState
            .hasEnteredBedroom &&
          window.roomsMonsterState
            .teddyGrabbed &&
          !window.roomsMonsterState
            .walkingTriggered
        ) {
          this.triggerWalkingMonster();
        }
      },


    /* ======================================================
       WALKING MODEL LOADED
    ====================================================== */

    onWalkingModelLoaded:
      function () {
        if (
          !this.walkingMonster
        ) {
          return;
        }

        this.walkingModelRoot =
          this.walkingMonster
            .getObject3D(
              'mesh'
            );

        console.log(
          'walking.glb loaded.'
        );
      },


    /* ======================================================
       STOP WALKING ANIMATION
    ====================================================== */

    stopWalkingAnimation:
      function () {
        if (
          this.walkingAction
        ) {
          try {
            this.walkingAction
              .stop();
          } catch (error) {
            // Safe cleanup.
          }
        }

        if (
          this.walkingMixer
        ) {
          try {
            this.walkingMixer
              .stopAllAction();
          } catch (error) {
            // Safe cleanup.
          }
        }

        this.walkingAction =
          null;

        this.walkingMixer =
          null;
      },


    /* ======================================================
       SHOW WALKING MONSTER
    ====================================================== */

    triggerWalkingMonster:
      function () {
        if (
          this.removed ||
          !this.walkingMonster ||
          window.roomsMonsterState
            .walkingTriggered
        ) {
          return;
        }

        window.roomsMonsterState
          .walkingTriggered =
            true;

        window.roomsMonsterState
          .walkingVisible =
            true;

        console.log(
          'Monster event: walking.glb triggered.'
        );

        /*
          Make sure the GLB remains at its Blender/world origin.
        */
        this.walkingMonster
          .setAttribute(
            'position',
            '0 0 0'
          );

        this.walkingMonster
          .setAttribute(
            'rotation',
            '0 0 0'
          );

        this.walkingMonster
          .setAttribute(
            'visible',
            true
          );

        this.scene.emit(
          'walking-monster-started',
          {},
          false
        );

        const root =
          this.walkingMonster
            .getObject3D(
              'mesh'
            );

        if (!root) {
          /*
            If the model somehow has not finished loading yet,
            still display it and use the fallback timer.
          */
          this.startWalkingFallback();

          return;
        }

        /*
          A-Frame stores the GLTF animations on the model root.
        */
        const animations =
          root.animations ||
          [];

        if (
          animations.length === 0
        ) {
          console.warn(
            'walking.glb contains no animation clips. ' +
            'Using fallback visibility timer.'
          );

          this.startWalkingFallback();

          return;
        }

        /*
          Play the first animation contained in walking.glb.

          This avoids requiring aframe-extras/animation-mixer.
        */
        this.walkingMixer =
          new THREE.AnimationMixer(
            root
          );

        const clip =
          animations[0];

        this.walkingAction =
          this.walkingMixer
            .clipAction(
              clip
            );

        this.walkingAction
          .setLoop(
            THREE.LoopOnce,
            1
          );

        this.walkingAction
          .clampWhenFinished =
            true;

        this.walkingAction
          .reset();

        this.walkingAction
          .play();

        const onFinished =
          () => {
            if (
              this.walkingMixer
            ) {
              this.walkingMixer
                .removeEventListener(
                  'finished',
                  onFinished
                );
            }

            this.hideWalkingMonster();
          };

        this.walkingMixer
          .addEventListener(
            'finished',
            onFinished
          );

        console.log(
          `Playing walking.glb animation: ${clip.name || 'Animation 1'}`
        );
      },


    /* ======================================================
       FALLBACK IF GLB HAS NO ANIMATION
    ====================================================== */

    startWalkingFallback:
      function () {
        if (
          this.walkingFallbackTimer
        ) {
          window.clearTimeout(
            this.walkingFallbackTimer
          );
        }

        this.walkingFallbackTimer =
          window.setTimeout(
            () => {
              this.walkingFallbackTimer =
                null;

              this.hideWalkingMonster();
            },
            ROOMS_MONSTER_CONFIG
              .fallbackWalkingDuration
          );
      },


    /* ======================================================
       HIDE WALKING MONSTER
    ====================================================== */

    hideWalkingMonster:
      function () {
        if (
          !this.walkingMonster
        ) {
          return;
        }

        this.stopWalkingAnimation();

        this.walkingMonster
          .setAttribute(
            'visible',
            false
          );

        window.roomsMonsterState
          .walkingVisible =
            false;

        console.log(
          'Monster event: walking.glb disappeared.'
        );

        this.scene.emit(
          'walking-monster-finished',
          {},
          false
        );
      },


    /* ======================================================
       FRAME CHECK
    ====================================================== */

    tick:
      function (
        time,
        delta
      ) {
        /*
          Update the monster's Three.js animation.
        */
        if (
          this.walkingMixer &&
          window.roomsMonsterState
            .walkingVisible &&
          delta
        ) {
          this.walkingMixer.update(
            delta / 1000
          );
        }

        /*
          Do not process room crossing while paused.
        */
        if (
          window.roomsPaused ||
          window.roomsInputLocked ||
          window.roomsInspectionOpen
        ) {
          return;
        }

        if (
          time -
          this.lastCheck <
          ROOMS_MONSTER_CONFIG
            .checkInterval
        ) {
          return;
        }

        this.lastCheck =
          time;

        if (
          !this.bedroom ||
          !this.player
        ) {
          this.refreshReferences();

          if (
            !this.bedroom ||
            !this.player
          ) {
            return;
          }
        }

        const bedroomBox =
          roomsMonsterGetBedroomBox(
            this.bedroom
          );

        if (!bedroomBox) {
          return;
        }

        const playerPosition =
          roomsMonsterGetPlayerPosition(
            this.player
          );

        if (!playerPosition) {
          return;
        }

        const inside =
          roomsMonsterPointInsideBedroom(
            playerPosition,
            bedroomBox
          );

        /*
          First successful check:
          establish current state without firing a fake enter/exit.
        */
        if (
          this.wasInsideBedroom ===
          null
        ) {
          this.wasInsideBedroom =
            inside;

          window.roomsMonsterState
            .playerInsideBedroom =
              inside;

          if (inside) {
            window.roomsMonsterState
              .hasEnteredBedroom =
                true;
          }

          return;
        }

        /*
          OUTSIDE → INSIDE
        */
        if (
          inside &&
          !this.wasInsideBedroom
        ) {
          this.wasInsideBedroom =
            true;

          this.playerEnteredBedroom();

          return;
        }

        /*
          INSIDE → OUTSIDE
        */
        if (
          !inside &&
          this.wasInsideBedroom
        ) {
          this.wasInsideBedroom =
            false;

          this.playerExitedBedroom();
        }
      },


    /* ======================================================
       CLEANUP
    ====================================================== */

    remove:
      function () {
        this.removed =
          true;

        if (
          this.teddy &&
          this.teddyListenerBound
        ) {
          this.teddy.removeEventListener(
            'stateadded',
            this.onTeddyStateAdded
          );
        }

        if (
          this.walkingMonster
        ) {
          this.walkingMonster
            .removeEventListener(
              'model-loaded',
              this.onWalkingModelLoaded
            );
        }

        if (
          this.walkingFallbackTimer
        ) {
          window.clearTimeout(
            this.walkingFallbackTimer
          );

          this.walkingFallbackTimer =
            null;
        }

        this.stopWalkingAnimation();

        if (
          window.getRoomsMonsterState
        ) {
          delete window
            .getRoomsMonsterState;
        }
      }
  }
);


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

    if (!scene) {
      console.warn(
        'monster.js: <a-scene> was not found.'
      );

      return;
    }

    /*
      Put the monster controller directly on the scene.
    */
    if (
      !scene.hasAttribute(
        'rooms-monster-events'
      )
    ) {
      scene.setAttribute(
        'rooms-monster-events',
        ''
      );
    }
  }
);