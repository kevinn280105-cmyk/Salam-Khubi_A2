/* ============================================================
   monster.js — ROOMS WITHIN

   Event:
   - Enter bedroom.
   - Physically grab Teddy and KEEP HOLDING it.
   - The bedroom door is #door / cua.glb.
   - Door opens normally through the existing door system.
   - Walk THROUGH the open doorway while still holding Teddy.
   - walking.glb appears at its baked Blender world position.
   - Its walk animation plays once, then it disappears.
   - Happens only once.

   IMPORTANT:
   - Bedroom bounds are kept only for debug / story awareness.
   - The monster scare is triggered by crossing the actual door plane,
     not by leaving the bedroom GLB bounding box.

   standing.glb is loaded hidden for a later event.
============================================================ */

const ROOMS_MONSTER_CONFIG = {
  bedroomSelector: '#bedroom',
  doorSelector: '#door',
  playerSelector: '#cam',
  teddySelector: '#teddy',

  walkingModel: 'walking.glb',
  standingModel: 'standing.glb',

  /*
    Slightly shrink the bedroom bounds.

    This stops the doorway/wall edge from counting
    as fully inside the bedroom.
  */
  bedroomInsetX: 0.18,
  bedroomInsetZ: 0.18,

  /*
    Door-crossing detection.

    doorCrossPadding:
    Adds a little forgiveness to the width of the doorway.

    doorSideEpsilon:
    Small dead-zone around the exact door plane so tiny headset
    movements do not count as crossing.

    maxDoorCrossDistance:
    Stops a very large teleport/jump from being mistaken for
    physically walking through the doorway.
  */
  doorCrossPadding: 0.35,
  doorSideEpsilon: 0.05,
  maxDoorCrossDistance: 1.5,

  /*
    Check player position every 100ms.
  */
  checkInterval: 100,

  /*
    If walking.glb does not contain an animation,
    show it for this long before hiding it.
  */
  fallbackWalkingDuration: 3500,

  /*
    Safety timeout.

    Even if the exported animation accidentally loops
    forever, the monster cannot remain visible forever.
  */
  maxWalkingVisibleDuration: 6000
};


/* ============================================================
   GLOBAL MONSTER STATE
============================================================ */

window.roomsMonsterState = {
  playerInsideBedroom: false,

  hasEnteredBedroom: false,

  teddyGrabbed: false,

  walkingTriggered: false,

  walkingVisible: false,

  walkingModelReady: false,

  standingModelReady: false,

  bedroomReady: false,

  doorReady: false,

  doorOpen: false,

  doorSide: 0,

  teddyCurrentlyHeld: false,

  teddyOriginDoorSide: 0,

  doorCrossArmed: false
};


/* ============================================================
   PAUSE CHECK
============================================================ */

function roomsMonsterPaused() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked ||
    window.roomsGameEnded
  );
}


/* ============================================================
   WORLD BOUNDING BOX
============================================================ */

function roomsMonsterWorldBox(
  entity
) {
  if (!entity) {
    return null;
  }

  const root =
    entity.getObject3D(
      'mesh'
    ) ||
    entity.object3D;

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

  return box.isEmpty()
    ? null
    : box;
}


/* ============================================================
   PLAYER POSITION
============================================================ */

function roomsMonsterPlayerPosition(
  target
) {
  const player =
    document.querySelector(
      ROOMS_MONSTER_CONFIG
        .playerSelector
    ) ||
    document.querySelector(
      '#rig'
    );

  if (!player) {
    return null;
  }

  /*
    #cam is used first.

    This means:
    - Mac walking
    - Quest joystick
    - teleport
    - physical headset movement

    all count.
  */

  player.object3D
    .getWorldPosition(
      target
    );

  return target;
}


/* ============================================================
   PHYSICAL TEDDY GRAB CHECK
============================================================ */

function roomsMonsterTeddyIsGrabbed() {
  const teddy =
    document.querySelector(
      ROOMS_MONSTER_CONFIG
        .teddySelector
    );

  if (!teddy) {
    return false;
  }

  /*
    natural-grabbable adds the A-Frame state:
    "grabbed"
  */

  if (
    teddy.is &&
    teddy.is(
      'grabbed'
    )
  ) {
    return true;
  }

  /*
    Extra fallback:
    also check whether natural-grabbable has a hand holder.
  */

  const grabbable =
    teddy.components &&
    teddy.components[
      'natural-grabbable'
    ];

  return Boolean(
    grabbable &&
    grabbable.heldBy
  );
}


/* ============================================================
   WALKING MONSTER ANIMATION

   We use THREE.AnimationMixer directly.

   This means you do NOT need another
   animation-mixer library/component.
============================================================ */

AFRAME.registerComponent(
  'rooms-walking-monster-player',
  {
    init: function () {
      this.root =
        null;

      this.mixer =
        null;

      this.action =
        null;

      this.clip =
        null;

      this.pendingPlay =
        false;

      this.playing =
        false;

      this.elapsedVisible =
        0;


      this.onModelLoaded =
        this.onModelLoaded
          .bind(
            this
          );

      this.onMixerFinished =
        this.onMixerFinished
          .bind(
            this
          );


      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );


      /*
        In case the model finished loading before
        this component initialized.
      */

      if (
        this.el.getObject3D(
          'mesh'
        )
      ) {
        this.onModelLoaded({
          detail: {
            model:
              this.el.getObject3D(
                'mesh'
              )
          }
        });
      }
    },


    /* ========================================================
       MODEL READY
    ======================================================== */

    onModelLoaded:
      function (
        event
      ) {
        this.root =
          event &&
          event.detail &&
          event.detail.model
            ? event.detail.model
            : this.el
                .getObject3D(
                  'mesh'
                );


        if (
          !this.root
        ) {
          return;
        }


        const animations =
          Array.isArray(
            this.root
              .animations
          )
            ? this.root
                .animations
            : [];


        /*
          Prefer an animation with "walk" in its name.

          If Blender exported it under another name,
          simply use the first animation instead.
        */

        this.clip =
          animations.find(
            (clip) =>
              String(
                clip.name ||
                ''
              )
                .toLowerCase()
                .includes(
                  'walk'
                )
          ) ||
          animations[0] ||
          null;


        if (
          this.clip
        ) {
          this.mixer =
            new THREE
              .AnimationMixer(
                this.root
              );


          this.mixer
            .addEventListener(
              'finished',
              this
                .onMixerFinished
            );


          this.action =
            this.mixer
              .clipAction(
                this.clip
              );


          /*
            ONE PLAY ONLY.
          */

          this.action
            .setLoop(
              THREE.LoopOnce,
              1
            );


          this.action
            .clampWhenFinished =
            true;
        }


        window
          .roomsMonsterState
          .walkingModelReady =
          true;


        console.log(
          'walking.glb ready.',

          {
            animation:
              this.clip
                ? (
                    this.clip.name ||
                    '(unnamed clip)'
                  )
                : 'none'
          }
        );


        /*
          If the player triggered the event before
          walking.glb finished loading, play it now.
        */

        if (
          this.pendingPlay
        ) {
          this.pendingPlay =
            false;

          this.playOnce();
        }
      },


    /* ========================================================
       PLAY
    ======================================================== */

    playOnce:
      function () {
        if (
          this.playing
        ) {
          return false;
        }


        if (
          !this.root
        ) {
          this.pendingPlay =
            true;

          return false;
        }


        this.playing =
          true;

        this.elapsedVisible =
          0;


        /*
          walking.glb was loaded hidden.

          NOW reveal it.
        */

        this.el.setAttribute(
          'visible',
          true
        );


        window
          .roomsMonsterState
          .walkingVisible =
          true;


        /*
          Play exported Blender animation.
        */

        if (
          this.action &&
          this.mixer
        ) {
          this.action.stop();

          this.action.reset();

          this.action.enabled =
            true;

          this.action.paused =
            false;

          this.action
            .setEffectiveTimeScale(
              1
            );

          this.action
            .setEffectiveWeight(
              1
            );

          this.action.play();
        }


        this.el.sceneEl.emit(
          'rooms-walking-monster-visible',

          {
            hasAnimation:
              Boolean(
                this.action
              ),

            animationName:
              this.clip
                ? (
                    this.clip.name ||
                    ''
                  )
                : ''
          },

          false
        );


        return true;
      },


    /* ========================================================
       HIDE
    ======================================================== */

    hide:
      function () {
        if (
          !this.playing &&
          !window
            .roomsMonsterState
            .walkingVisible
        ) {
          return;
        }


        this.playing =
          false;

        this.pendingPlay =
          false;


        if (
          this.action
        ) {
          this.action.stop();
        }


        this.el.setAttribute(
          'visible',
          false
        );


        window
          .roomsMonsterState
          .walkingVisible =
          false;


        this.el.sceneEl.emit(
          'rooms-walking-monster-hidden',
          {},
          false
        );
      },


    /* ========================================================
       ANIMATION FINISHED
    ======================================================== */

    onMixerFinished:
      function () {
        this.hide();
      },


    /* ========================================================
       ANIMATION UPDATE
    ======================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime ||
          !this.playing ||
          roomsMonsterPaused()
        ) {
          return;
        }


        this.elapsedVisible +=
          deltaTime;


        if (
          this.mixer
        ) {
          this.mixer.update(
            deltaTime /
            1000
          );
        }


        /*
          If walking.glb contains NO animation,
          still show the monster briefly.
        */

        if (
          !this.action &&
          this.elapsedVisible >=
            ROOMS_MONSTER_CONFIG
              .fallbackWalkingDuration
        ) {
          this.hide();

          return;
        }


        /*
          Safety:
          never stay visible forever.
        */

        if (
          this.elapsedVisible >=
            ROOMS_MONSTER_CONFIG
              .maxWalkingVisibleDuration
        ) {
          this.hide();
        }
      },


    /* ========================================================
       REMOVE
    ======================================================== */

    remove:
      function () {
        this.el
          .removeEventListener(
            'model-loaded',
            this.onModelLoaded
          );


        if (
          this.mixer
        ) {
          this.mixer
            .removeEventListener(
              'finished',
              this
                .onMixerFinished
            );
        }


        this.hide();


        this.root =
          null;

        this.mixer =
          null;

        this.action =
          null;

        this.clip =
          null;
      }
  }
);


/* ============================================================
   MAIN MONSTER EVENT
============================================================ */

AFRAME.registerComponent(
  'rooms-monster-events',
  {
    init: function () {
      this.bedroom =
        null;

      this.door =
        null;

      this.teddy =
        null;

      this.walkingMonster =
        null;

      this.standingMonster =
        null;


      /*
        Bedroom box is kept for debug / story awareness only.

        It is NOT what activates walking.glb anymore.
      */

      this.bedroomBox =
        new THREE.Box3();


      /*
        Fixed CLOSED-door box.

        We prefer the cached box created by auto-door-proximity,
        because that box stays in the doorway even while cua.glb
        swings open.
      */

      this.doorBox =
        new THREE.Box3();

      this.doorCenter =
        new THREE.Vector3();

      this.doorSize =
        new THREE.Vector3();

      this.doorNormalAxis =
        null;

      this.doorLateralAxis =
        null;


      this.playerWorld =
        new THREE.Vector3();

      this.previousPlayerWorld =
        new THREE.Vector3();

      this.hasPreviousPlayerWorld =
        false;


      this.lastCheck =
        0;

      this.lastPrepareAttempt =
        0;


      /*
        First stable side of the doorway where Teddy was picked up.

        Example:
          bedroom side = +1
          hallway side = -1

        The exact sign does not matter. We only care that the player
        later crosses to the opposite side while still holding Teddy.
      */

      this.teddyOriginDoorSide =
        0;


      /*
        Bedroom state remains for debug / compatibility.
      */

      this.previousInside =
        null;


      this.onBedroomModelLoaded =
        this
          .onBedroomModelLoaded
          .bind(
            this
          );


      this.onDoorModelLoaded =
        this
          .onDoorModelLoaded
          .bind(
            this
          );


      this.onDoorReady =
        this
          .onDoorReady
          .bind(
            this
          );


      this.onTeddyStateAdded =
        this
          .onTeddyStateAdded
          .bind(
            this
          );


      this.prepare =
        this.prepare.bind(
          this
        );


      /*
        Make the hidden monster entities.
      */

      this.createMonsterEntities();


      /*
        Find bedroom / door / Teddy.
      */

      this.prepare();


      /*
        Models/components may initialize slightly later,
        so retry several times.
      */

      [
        100,
        400,
        1000,
        2000
      ].forEach(
        (delay) => {
          window.setTimeout(
            this.prepare,
            delay
          );
        }
      );
    },


    /* ========================================================
       CREATE MONSTER ENTITIES
    ======================================================== */

    createMonsterEntities:
      function () {
        /* ----------------------------------------------------
           WALKING MONSTER
        ---------------------------------------------------- */

        let walking =
          document.querySelector(
            '#walkingMonster'
          );


        if (
          !walking
        ) {
          walking =
            document
              .createElement(
                'a-entity'
              );


          walking.setAttribute(
            'id',
            'walkingMonster'
          );


          walking.setAttribute(
            'class',
            'rooms-monster'
          );


          walking.setAttribute(
            'gltf-model',

            `url(${ROOMS_MONSTER_CONFIG.walkingModel})`
          );


          /*
            IMPORTANT:

            Do NOT manually move it.

            walking.glb already has the intended scene position
            baked into Blender.
          */

          walking.setAttribute(
            'position',
            '0 0 0'
          );


          walking.setAttribute(
            'rotation',
            '0 0 0'
          );


          walking.setAttribute(
            'visible',
            'false'
          );


          walking.setAttribute(
            'rooms-walking-monster-player',
            ''
          );


          this.el.appendChild(
            walking
          );
        }


        this.walkingMonster =
          walking;



        /* ----------------------------------------------------
           STANDING MONSTER

           Loaded now but NOT USED YET.
        ---------------------------------------------------- */

        let standing =
          document.querySelector(
            '#standingMonster'
          );


        if (
          !standing
        ) {
          standing =
            document
              .createElement(
                'a-entity'
              );


          standing.setAttribute(
            'id',
            'standingMonster'
          );


          standing.setAttribute(
            'class',
            'rooms-monster'
          );


          standing.setAttribute(
            'gltf-model',

            `url(${ROOMS_MONSTER_CONFIG.standingModel})`
          );


          /*
            Also uses its baked Blender position.
          */

          standing.setAttribute(
            'position',
            '0 0 0'
          );


          standing.setAttribute(
            'rotation',
            '0 0 0'
          );


          standing.setAttribute(
            'visible',
            'false'
          );


          standing.addEventListener(
            'model-loaded',

            () => {
              window
                .roomsMonsterState
                .standingModelReady =
                true;


              console.log(
                'standing.glb ready and hidden for later.'
              );
            },

            {
              once:
                true
            }
          );


          this.el.appendChild(
            standing
          );
        }


        this.standingMonster =
          standing;
      },


    /* ========================================================
       FIND BEDROOM + DOOR + TEDDY
    ======================================================== */

    prepare:
      function () {
        const bedroom =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .bedroomSelector
          );


        if (
          bedroom &&
          bedroom !==
            this.bedroom
        ) {
          if (
            this.bedroom
          ) {
            this.bedroom
              .removeEventListener(
                'model-loaded',
                this
                  .onBedroomModelLoaded
              );
          }


          this.bedroom =
            bedroom;


          this.bedroom
            .addEventListener(
              'model-loaded',
              this
                .onBedroomModelLoaded
            );
        }


        /*
          Bedroom might already be loaded.
        */

        if (
          this.bedroom &&
          this.bedroom
            .getObject3D(
              'mesh'
            )
        ) {
          this.updateBedroomBox();
        }



        const door =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .doorSelector
          );


        if (
          door &&
          door !==
            this.door
        ) {
          if (
            this.door
          ) {
            this.door
              .removeEventListener(
                'model-loaded',
                this
                  .onDoorModelLoaded
              );

            this.door
              .removeEventListener(
                'rooms-door-ready',
                this
                  .onDoorReady
              );
          }


          this.door =
            door;


          this.door
            .addEventListener(
              'model-loaded',
              this
                .onDoorModelLoaded
            );

          this.door
            .addEventListener(
              'rooms-door-ready',
              this
                .onDoorReady
            );
        }


        this.prepareDoorTrigger();



        const teddy =
          document.querySelector(
            ROOMS_MONSTER_CONFIG
              .teddySelector
          );


        if (
          teddy &&
          teddy !==
            this.teddy
        ) {
          if (
            this.teddy
          ) {
            this.teddy
              .removeEventListener(
                'stateadded',
                this
                  .onTeddyStateAdded
              );
          }


          this.teddy =
            teddy;


          /*
            We specifically listen for physical
            A-Frame "grabbed" state.
          */

          this.teddy
            .addEventListener(
              'stateadded',
              this
                .onTeddyStateAdded
            );
        }


        /*
          Fallback if Teddy was already being held.
        */

        if (
          roomsMonsterTeddyIsGrabbed()
        ) {
          this.markTeddyGrabbed();
        }
      },


    /* ========================================================
       BEDROOM MODEL READY
    ======================================================== */

    onBedroomModelLoaded:
      function () {
        this.updateBedroomBox();
      },


    /* ========================================================
       DOOR MODEL / HINGE READY
    ======================================================== */

    onDoorModelLoaded:
      function () {
        this.prepareDoorTrigger();
      },


    onDoorReady:
      function () {
        this.prepareDoorTrigger();
      },


    /* ========================================================
       BEDROOM BOUNDARY

       Kept only for debug / compatibility.
       It does NOT trigger the monster anymore.
    ======================================================== */

    updateBedroomBox:
      function () {
        const box =
          roomsMonsterWorldBox(
            this.bedroom
          );


        if (
          !box
        ) {
          window
            .roomsMonsterState
            .bedroomReady =
            false;


          return false;
        }


        this.bedroomBox
          .copy(
            box
          );


        window
          .roomsMonsterState
          .bedroomReady =
          true;


        return true;
      },


    /* ========================================================
       PREPARE FIXED CUA.GLB DOORWAY
    ======================================================== */

    prepareDoorTrigger:
      function () {
        if (
          !this.door
        ) {
          window
            .roomsMonsterState
            .doorReady =
            false;

          return false;
        }


        let sourceBox =
          null;


        /*
          BEST SOURCE:

          auto-door-proximity already caches the CLOSED door box
          before the door leaf moves.
        */

        const autoDoor =
          this.door.components &&
          this.door.components[
            'auto-door-proximity'
          ];


        if (
          autoDoor &&
          autoDoor.closedDoorBox &&
          !autoDoor.closedDoorBox
            .isEmpty()
        ) {
          sourceBox =
            autoDoor.closedDoorBox;
        }


        /*
          FALLBACK:

          If auto-door-proximity has not cached its box yet,
          use the GLB's current box only while the door is closed.
        */

        if (
          !sourceBox &&
          !this.isDoorOpen()
        ) {
          sourceBox =
            roomsMonsterWorldBox(
              this.door
            );
        }


        if (
          !sourceBox ||
          sourceBox.isEmpty()
        ) {
          window
            .roomsMonsterState
            .doorReady =
            false;

          return false;
        }


        this.doorBox
          .copy(
            sourceBox
          );


        this.doorBox
          .getCenter(
            this.doorCenter
          );

        this.doorBox
          .getSize(
            this.doorSize
          );


        /*
          A closed door is wide along one horizontal axis
          and thin along the other.

          The THIN axis is the doorway normal — the direction
          the player crosses when walking through it.
        */

        if (
          this.doorSize.x <=
          this.doorSize.z
        ) {
          this.doorNormalAxis =
            'x';

          this.doorLateralAxis =
            'z';

        } else {
          this.doorNormalAxis =
            'z';

          this.doorLateralAxis =
            'x';
        }


        window
          .roomsMonsterState
          .doorReady =
          true;


        console.log(
          'Monster doorway trigger ready.',

          {
            normalAxis:
              this.doorNormalAxis,

            lateralAxis:
              this.doorLateralAxis,

            boxMin:
              this.doorBox
                .min
                .toArray(),

            boxMax:
              this.doorBox
                .max
                .toArray()
          }
        );


        return true;
      },


    /* ========================================================
       DOOR OPEN CHECK
    ======================================================== */

    isDoorOpen:
      function () {
        if (
          !this.door ||
          !this.door.components
        ) {
          return false;
        }


        const hinge =
          this.door.components[
            'door-hinge'
          ];


        if (
          !hinge ||
          !hinge.parts ||
          !hinge.parts.length
        ) {
          return false;
        }


        return hinge.parts
          .some(
            (part) => {
              const state =
                hinge.createState
                  ? hinge.createState(
                      part
                    )
                  : (
                      part.userData
                        ? part.userData
                            .roomsDoorState
                        : null
                    );


              return Boolean(
                state &&
                state.isOpen
              );
            }
          );
      },


    /* ========================================================
       PLAYER SIDE OF DOOR

       Returns:
       +1 = one side
       -1 = opposite side
        0 = inside tiny dead-zone on the plane
    ======================================================== */

    getDoorSide:
      function (
        player
      ) {
        if (
          !player ||
          !window
            .roomsMonsterState
            .doorReady ||
          !this.doorNormalAxis
        ) {
          return 0;
        }


        const normalValue =
          player[
            this.doorNormalAxis
          ] -
          this.doorCenter[
            this.doorNormalAxis
          ];


        if (
          normalValue >
          ROOMS_MONSTER_CONFIG
            .doorSideEpsilon
        ) {
          return 1;
        }


        if (
          normalValue <
          -ROOMS_MONSTER_CONFIG
            .doorSideEpsilon
        ) {
          return -1;
        }


        return 0;
      },


    /* ========================================================
       DID PLAYER'S MOVEMENT SEGMENT PASS THROUGH THE DOORWAY?
    ======================================================== */

    didCrossDoorway:
      function (
        previous,
        current
      ) {
        if (
          !previous ||
          !current ||
          !window
            .roomsMonsterState
            .doorReady ||
          !this.doorNormalAxis ||
          !this.doorLateralAxis
        ) {
          return false;
        }


        const normalAxis =
          this.doorNormalAxis;

        const lateralAxis =
          this.doorLateralAxis;


        const previousNormal =
          previous[
            normalAxis
          ] -
          this.doorCenter[
            normalAxis
          ];

        const currentNormal =
          current[
            normalAxis
          ] -
          this.doorCenter[
            normalAxis
          ];


        /*
          The movement segment must actually touch/cross
          the door plane between the two samples.
        */

        if (
          previousNormal *
          currentNormal >
          0
        ) {
          return false;
        }


        const normalDelta =
          currentNormal -
          previousNormal;


        if (
          Math.abs(
            normalDelta
          ) <
          0.00001
        ) {
          return false;
        }


        /*
          Ignore very large jumps / long teleports.
        */

        const horizontalDistance =
          Math.hypot(
            current.x -
              previous.x,

            current.z -
              previous.z
          );


        if (
          horizontalDistance >
          ROOMS_MONSTER_CONFIG
            .maxDoorCrossDistance
        ) {
          return false;
        }


        /*
          Interpolate where the movement line intersects
          the exact doorway plane.
        */

        const t =
          -previousNormal /
          normalDelta;


        if (
          t < 0 ||
          t > 1
        ) {
          return false;
        }


        const crossingLateral =
          THREE.MathUtils
            .lerp(
              previous[
                lateralAxis
              ],

              current[
                lateralAxis
              ],

              t
            );


        const minimum =
          this.doorBox.min[
            lateralAxis
          ] -
          ROOMS_MONSTER_CONFIG
            .doorCrossPadding;

        const maximum =
          this.doorBox.max[
            lateralAxis
          ] +
          ROOMS_MONSTER_CONFIG
            .doorCrossPadding;


        return Boolean(
          crossingLateral >=
            minimum &&

          crossingLateral <=
            maximum
        );
      },


    /* ========================================================
       TEDDY PHYSICALLY GRABBED
    ======================================================== */

    onTeddyStateAdded:
      function (
        event
      ) {
        /*
          A-Frame stateadded supplies:
          event.detail.state
        */

        const state =
          event &&
          event.detail
            ? event.detail.state
            : '';


        if (
          state ===
          'grabbed'
        ) {
          this.markTeddyGrabbed();
        }
      },


    markTeddyGrabbed:
      function () {
        /*
          Remember that Teddy has been physically grabbed
          at least once for debug/history.

          This alone does NOT trigger walking.glb.
          Teddy must still be held while crossing the open door.
        */

        if (
          window
            .roomsMonsterState
            .teddyGrabbed
        ) {
          return;
        }


        window
          .roomsMonsterState
          .teddyGrabbed =
          true;


        this.el.emit(
          'rooms-teddy-first-grabbed',
          {},
          false
        );


        console.log(
          'Monster event armed: Teddy has been physically grabbed.'
        );
      },


    /* ========================================================
       IS PLAYER INSIDE BEDROOM?

       Debug / compatibility only.
    ======================================================== */

    isPlayerInsideBedroom:
      function (
        suppliedPlayer
      ) {
        if (
          !window
            .roomsMonsterState
            .bedroomReady
        ) {
          return false;
        }


        const player =
          suppliedPlayer ||
          roomsMonsterPlayerPosition(
            this.playerWorld
          );


        if (
          !player
        ) {
          return false;
        }


        const box =
          this.bedroomBox;


        const width =
          box.max.x -
          box.min.x;


        const depth =
          box.max.z -
          box.min.z;


        const insetX =
          width >
            ROOMS_MONSTER_CONFIG
              .bedroomInsetX *
              2 +
            0.35
            ? ROOMS_MONSTER_CONFIG
                .bedroomInsetX
            : 0;


        const insetZ =
          depth >
            ROOMS_MONSTER_CONFIG
              .bedroomInsetZ *
              2 +
            0.35
            ? ROOMS_MONSTER_CONFIG
                .bedroomInsetZ
            : 0;


        return Boolean(
          player.x >=
            box.min.x +
              insetX &&

          player.x <=
            box.max.x -
              insetX &&

          player.z >=
            box.min.z +
              insetZ &&

          player.z <=
            box.max.z -
              insetZ
        );
      },


    /* ========================================================
       TRIGGER WALKING.GLB
    ======================================================== */

    triggerWalkingMonster:
      function () {
        /*
          ONE TIME ONLY.
        */

        if (
          window
            .roomsMonsterState
            .walkingTriggered
        ) {
          return false;
        }


        window
          .roomsMonsterState
          .walkingTriggered =
          true;


        const monster =
          this.walkingMonster ||
          document.querySelector(
            '#walkingMonster'
          );


        if (
          !monster
        ) {
          console.warn(
            'walkingMonster entity was not found.'
          );


          return false;
        }


        const player =
          monster.components[
            'rooms-walking-monster-player'
          ];


        if (
          player
        ) {
          player.playOnce();

        } else {
          /*
            Component might be created one frame
            after the A-Frame entity.
          */

          window.setTimeout(
            () => {
              const retry =
                monster.components[
                  'rooms-walking-monster-player'
                ];


              if (
                retry
              ) {
                retry.playOnce();
              }
            },

            0
          );
        }


        this.el.emit(
          'rooms-walking-monster-triggered',

          {
            reason:
              'crossed-open-door-holding-teddy'
          },

          false
        );


        console.log(
          'MONSTER: walking.glb triggered after crossing the open cua.glb doorway while holding Teddy.'
        );


        return true;
      },


    /* ========================================================
       MAIN CHECK
    ======================================================== */

    tick:
      function (
        time
      ) {
        if (
          roomsMonsterPaused() ||

          time -
            this.lastCheck <
            ROOMS_MONSTER_CONFIG
              .checkInterval
        ) {
          return;
        }


        this.lastCheck =
          time;


        /*
          Retry preparation occasionally if the door/model
          initialized later than expected.
        */

        if (
          !window
            .roomsMonsterState
            .doorReady &&

          time -
            this.lastPrepareAttempt >=
            500
        ) {
          this.lastPrepareAttempt =
            time;

          this.prepare();
        }


        const player =
          roomsMonsterPlayerPosition(
            this.playerWorld
          );


        if (
          !player
        ) {
          return;
        }


        /* ----------------------------------------------------
           KEEP OLD BEDROOM STATE FOR DEBUG / COMPATIBILITY
        ---------------------------------------------------- */

        if (
          window
            .roomsMonsterState
            .bedroomReady
        ) {
          const inside =
            this.isPlayerInsideBedroom(
              player
            );


          window
            .roomsMonsterState
            .playerInsideBedroom =
            inside;


          if (
            this.previousInside ===
            null
          ) {
            this.previousInside =
              inside;

            if (
              inside
            ) {
              window
                .roomsMonsterState
                .hasEnteredBedroom =
                true;
            }

          } else {
            if (
              !this.previousInside &&
              inside
            ) {
              window
                .roomsMonsterState
                .hasEnteredBedroom =
                true;


              this.el.emit(
                'rooms-player-entered-bedroom',
                {},
                false
              );
            }


            this.previousInside =
              inside;
          }
        }


        /* ----------------------------------------------------
           CURRENT TEDDY HOLD STATE
        ---------------------------------------------------- */

        const teddyHeld =
          roomsMonsterTeddyIsGrabbed();


        window
          .roomsMonsterState
          .teddyCurrentlyHeld =
          teddyHeld;


        if (
          teddyHeld &&
          !window
            .roomsMonsterState
            .teddyGrabbed
        ) {
          this.markTeddyGrabbed();
        }


        /* ----------------------------------------------------
           CURRENT DOOR STATE
        ---------------------------------------------------- */

        const doorOpen =
          this.isDoorOpen();


        window
          .roomsMonsterState
          .doorOpen =
          doorOpen;


        const currentDoorSide =
          window
            .roomsMonsterState
            .doorReady

            ? this.getDoorSide(
                player
              )

            : 0;


        window
          .roomsMonsterState
          .doorSide =
          currentDoorSide;


        /* ----------------------------------------------------
           ARM THE DIRECTION OF THE SCARE

           The first stable door side where Teddy is held becomes
           Teddy's original / bedroom side.

           This means dropping Teddy outside and picking it up again
           cannot accidentally reverse the scare direction.
        ---------------------------------------------------- */

        if (
          teddyHeld &&
          window
            .roomsMonsterState
            .doorReady &&
          this.teddyOriginDoorSide ===
            0 &&
          currentDoorSide !==
            0
        ) {
          this.teddyOriginDoorSide =
            currentDoorSide;


          window
            .roomsMonsterState
            .teddyOriginDoorSide =
            this.teddyOriginDoorSide;


          console.log(
            'Monster doorway armed from side:',
            this.teddyOriginDoorSide
          );
        }


        window
          .roomsMonsterState
          .doorCrossArmed =
          Boolean(
            teddyHeld &&
            this.teddyOriginDoorSide !==
              0 &&
            window
              .roomsMonsterState
              .doorReady
          );


        /* ----------------------------------------------------
           FIRST PLAYER SAMPLE
        ---------------------------------------------------- */

        if (
          !this.hasPreviousPlayerWorld
        ) {
          this.previousPlayerWorld
            .copy(
              player
            );

          this.hasPreviousPlayerWorld =
            true;

          return;
        }


        /* ----------------------------------------------------
           ACTUAL MONSTER TRIGGER

           ALL must be true:
           1. Teddy is STILL in the player's hand.
           2. cua.glb / #door is open.
           3. We know which side Teddy came from.
           4. Player has reached the opposite side.
           5. The movement segment physically crossed the doorway.
           6. Scare has never played before.
        ---------------------------------------------------- */

        if (
          teddyHeld &&

          doorOpen &&

          this.teddyOriginDoorSide !==
            0 &&

          currentDoorSide ===
            -this.teddyOriginDoorSide &&

          !window
            .roomsMonsterState
            .walkingTriggered &&

          this.didCrossDoorway(
            this.previousPlayerWorld,
            player
          )
        ) {
          this.triggerWalkingMonster();
        }


        this.previousPlayerWorld
          .copy(
            player
          );
      },


    /* ========================================================
       REMOVE
    ======================================================== */

    remove:
      function () {
        if (
          this.bedroom
        ) {
          this.bedroom
            .removeEventListener(
              'model-loaded',
              this
                .onBedroomModelLoaded
            );
        }


        if (
          this.door
        ) {
          this.door
            .removeEventListener(
              'model-loaded',
              this
                .onDoorModelLoaded
            );

          this.door
            .removeEventListener(
              'rooms-door-ready',
              this
                .onDoorReady
            );
        }


        if (
          this.teddy
        ) {
          this.teddy
            .removeEventListener(
              'stateadded',
              this
                .onTeddyStateAdded
            );
        }
      }
  }
);


/* ============================================================
   DEBUG

   Browser console:

   getRoomsMonsterState()
============================================================ */

window.getRoomsMonsterState =
  function () {
    const scene =
      document.querySelector(
        'a-scene'
      );


    const system =
      scene &&
      scene.components
        ? scene.components[
            'rooms-monster-events'
          ]
        : null;


    return {
      playerInsideBedroom:
        window
          .roomsMonsterState
          .playerInsideBedroom,


      hasEnteredBedroom:
        window
          .roomsMonsterState
          .hasEnteredBedroom,


      teddyGrabbed:
        window
          .roomsMonsterState
          .teddyGrabbed,


      walkingTriggered:
        window
          .roomsMonsterState
          .walkingTriggered,


      walkingVisible:
        window
          .roomsMonsterState
          .walkingVisible,


      walkingModelReady:
        window
          .roomsMonsterState
          .walkingModelReady,


      standingModelReady:
        window
          .roomsMonsterState
          .standingModelReady,


      bedroomReady:
        window
          .roomsMonsterState
          .bedroomReady,


      doorReady:
        window
          .roomsMonsterState
          .doorReady,


      doorOpen:
        window
          .roomsMonsterState
          .doorOpen,


      teddyCurrentlyHeld:
        window
          .roomsMonsterState
          .teddyCurrentlyHeld,


      doorSide:
        window
          .roomsMonsterState
          .doorSide,


      teddyOriginDoorSide:
        window
          .roomsMonsterState
          .teddyOriginDoorSide,


      doorCrossArmed:
        window
          .roomsMonsterState
          .doorCrossArmed,


      doorNormalAxis:
        system
          ? system.doorNormalAxis
          : null,


      doorBoxMin:
        system &&
        window
          .roomsMonsterState
          .doorReady

          ? system.doorBox.min.toArray()
          : null,


      doorBoxMax:
        system &&
        window
          .roomsMonsterState
          .doorReady

          ? system.doorBox.max.toArray()
          : null,


      walkingEntityFound:
        Boolean(
          document.querySelector(
            '#walkingMonster'
          )
        ),


      standingEntityFound:
        Boolean(
          document.querySelector(
            '#standingMonster'
          )
        ),


      systemReady:
        Boolean(
          system
        )
    };
  };


/* ============================================================
   MANUAL MONSTER TEST

   Browser console:

   triggerRoomsWalkingMonster()

   This lets you test the walking.glb animation
   without doing the whole Teddy sequence.
============================================================ */

window.triggerRoomsWalkingMonster =
  function () {
    const scene =
      document.querySelector(
        'a-scene'
      );


    const system =
      scene &&
      scene.components
        ? scene.components[
            'rooms-monster-events'
          ]
        : null;


    if (
      !system
    ) {
      console.warn(
        'rooms-monster-events is not ready.'
      );


      return false;
    }


    return system
      .triggerWalkingMonster();
  };


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
      console.warn(
        'monster.js: no <a-scene> found.'
      );


      return;
    }


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