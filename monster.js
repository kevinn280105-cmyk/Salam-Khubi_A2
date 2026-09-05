/* ============================================================
   monster.js — ROOMS WITHIN
   FULL REPLACEMENT

   WALKING MONSTER EVENT:
   - Enter bedroom.
   - Physically grab Teddy and KEEP HOLDING it.
   - Bedroom door is #door / cua.glb.
   - Door opens through the existing door system.
   - Walk THROUGH the open doorway while still holding Teddy.
   - walking.glb appears at its baked Blender world position.
   - Walking animation plays once.
   - walking.glb disappears.
   - Happens only once.

   STANDING MONSTER EVENT:
   - story.js emits "story-item-snapped" whenever one of the
     three quest items successfully locks onto #truocbantho.
   - After TWO unique items have been placed:
       standing.glb becomes visible.
   - standing.glb stays completely still.
   - The player must actually LOOK toward her.
   - Once seen:
       1. screen quickly fades to black
       2. black stays for a moment
       3. standing.glb is hidden WHILE the screen is black
       4. black stays briefly again
       5. screen fades back in
       6. she is gone
   - Happens only once.

   IMPORTANT:
   - walking.glb position remains 0 0 0.
   - standing.glb position remains 0 0 0.
   - Their intended world placement is baked into Blender.
============================================================ */


/* ============================================================
   CONFIG
============================================================ */

const ROOMS_MONSTER_CONFIG = {
  bedroomSelector: '#bedroom',

  doorSelector: '#door',

  playerSelector: '#cam',

  teddySelector: '#teddy',

  walkingModel: 'walking.glb',

  standingModel: 'standing.glb',


  /* ----------------------------------------------------------
     BEDROOM DEBUG BOUNDS
  ---------------------------------------------------------- */

  bedroomInsetX: 0.18,

  bedroomInsetZ: 0.18,


  /* ----------------------------------------------------------
     DOOR CROSSING
  ---------------------------------------------------------- */

  /*
    Small forgiveness around the doorway width.
  */

  doorCrossPadding: 0.35,


  /*
    Tiny dead-zone directly on the doorway plane.

    Helps prevent very small Quest headset movement from
    being interpreted as crossing through the door.
  */

  doorSideEpsilon: 0.05,


  /*
    Prevent a huge teleport from being interpreted as
    physically walking through the doorway.
  */

  maxDoorCrossDistance: 1.5,


  /* ----------------------------------------------------------
     CHECK FREQUENCY
  ---------------------------------------------------------- */

  checkInterval: 100,


  /* ----------------------------------------------------------
     WALKING MONSTER
  ---------------------------------------------------------- */

  /*
    If walking.glb has no animation,
    keep it visible for this long.
  */

  fallbackWalkingDuration: 3500,


  /*
    Safety maximum even if its animation
    accidentally loops forever.
  */

  maxWalkingVisibleDuration: 6000,


  /* ----------------------------------------------------------
     STANDING MONSTER
  ---------------------------------------------------------- */

  /*
    Number of altar objects required before she appears.
  */

  standingRequiredItems: 2,


  /*
    Player must look fairly directly toward her.

    18 degrees gives the player a chance to notice her
    instead of triggering from the extreme edge of vision.
  */

  standingLookAngle: 18,


  /*
    Maximum distance at which looking toward her counts.

    Large enough for the room, while helping avoid very
    distant false positives.
  */

  standingLookMaxDistance: 18,


  /*
    Let her exist for at least this long before
    "player saw her" can activate.

    If she spawns directly in front of the player,
    this gives them a visible glimpse first.
  */

  standingMinimumVisibleTime: 450,


  /* ----------------------------------------------------------
     STANDING MONSTER BLACKOUT
  ---------------------------------------------------------- */

  /*
    Fast supernatural blink into darkness.
  */

  standingBlackFadeIn: 130,


  /*
    IMPORTANT:

    Screen is ALREADY fully black before she disappears.

    This is the time we stay black BEFORE hiding her.
  */

  standingBlackBeforeHide: 350,


  /*
    She is now hidden, but screen stays black a little
    longer so the player never catches the model despawning.
  */

  standingBlackAfterHide: 400,


  /*
    Restore the player's vision more slowly.
  */

  standingBlackFadeOut: 380
};


/* ============================================================
   GLOBAL MONSTER STATE
============================================================ */

window.roomsMonsterState = {
  playerInsideBedroom: false,

  hasEnteredBedroom: false,

  teddyGrabbed: false,

  teddyCurrentlyHeld: false,


  /* ----------------------------------------------------------
     WALKING
  ---------------------------------------------------------- */

  walkingTriggered: false,

  walkingVisible: false,

  walkingModelReady: false,


  /* ----------------------------------------------------------
     STANDING
  ---------------------------------------------------------- */

  standingModelReady: false,

  standingTriggered: false,

  standingVisible: false,

  standingSeen: false,

  standingBlackoutRunning: false,

  standingFinished: false,

  standingPlacedCount: 0,


  /* ----------------------------------------------------------
     BEDROOM / DOOR
  ---------------------------------------------------------- */

  bedroomReady: false,

  doorReady: false,

  doorOpen: false,

  doorSide: 0,

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
   PAUSE-AWARE WAIT

   ui-scare.js already exports waitRoomsMilliseconds().

   Use it when available so the scare timer does not burn
   through while the game is paused.

   Fallback exists in case ui-scare.js has not initialized yet.
============================================================ */

function roomsMonsterWait(
  milliseconds
) {
  if (
    typeof window
      .waitRoomsMilliseconds ===
    'function'
  ) {
    return window
      .waitRoomsMilliseconds(
        milliseconds
      );
  }

  return new Promise(
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds
      );
    }
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
    also check whether natural-grabbable has a holder.
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

   Uses THREE.AnimationMixer directly.
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
        Model may already have loaded before
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
          Prefer an animation containing "walk".

          Otherwise use the first exported animation.
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


        this.el.setAttribute(
          'visible',
          true
        );


        window
          .roomsMonsterState
          .walkingVisible =
          true;


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
          No animation?
          Keep the monster visible briefly anyway.
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
          Safety maximum.
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

      this.blackout =
        null;


      /* --------------------------------------------------------
         BEDROOM DEBUG
      -------------------------------------------------------- */

      this.bedroomBox =
        new THREE.Box3();


      /* --------------------------------------------------------
         DOOR CROSSING
      -------------------------------------------------------- */

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


      /* --------------------------------------------------------
         PLAYER MOVEMENT
      -------------------------------------------------------- */

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


      this.previousInside =
        null;


      /*
        First stable side of the doorway where
        Teddy is physically held.
      */

      this.teddyOriginDoorSide =
        0;


      /* --------------------------------------------------------
         STANDING MONSTER EVENT
      -------------------------------------------------------- */

      /*
        Unique altar item keys received from story.js.
      */

      this.standingPlacedItems =
        new Set();


      /*
        Time she first became visible.
      */

      this.standingShownAt =
        0;


      /*
        Gaze math.
      */

      this.standingCenter =
        new THREE.Vector3();

      this.standingCameraPosition =
        new THREE.Vector3();

      this.standingLookDirection =
        new THREE.Vector3();

      this.standingDirectionToMonster =
        new THREE.Vector3();


      /*
        Black overlay state.
      */

      this.blackoutOpacity =
        0;

      this.blackoutAnimationFrame =
        null;


      /* --------------------------------------------------------
         BOUND FUNCTIONS
      -------------------------------------------------------- */

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


      this.onStoryItemSnapped =
        this
          .onStoryItemSnapped
          .bind(
            this
          );


      this.prepare =
        this.prepare.bind(
          this
        );


      /* --------------------------------------------------------
         CREATE HIDDEN MONSTER ENTITIES
      -------------------------------------------------------- */

      this.createMonsterEntities();


      /* --------------------------------------------------------
         CREATE CAMERA BLACKOUT
      -------------------------------------------------------- */

      this.createStandingBlackout();


      /* --------------------------------------------------------
         LISTEN FOR ALTAR PLACEMENT
      -------------------------------------------------------- */

      if (
        this.el.sceneEl
      ) {
        this.el.sceneEl
          .addEventListener(
            'story-item-snapped',
            this.onStoryItemSnapped
          );
      }


      /* --------------------------------------------------------
         FIND BEDROOM / DOOR / TEDDY
      -------------------------------------------------------- */

      this.prepare();


      /*
        Components/models can initialize slightly later.
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


      /*
        Recover altar state if story.js finished snapping
        something before monster.js was fully ready.
      */

      [
        250,
        1000,
        2500
      ].forEach(
        (delay) => {
          window.setTimeout(
            () => {
              this.syncStandingPlacementState();
            },

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

            Do NOT move this.

            Position is baked into walking.glb.
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
            IMPORTANT:

            Do NOT manually move her.

            standing.glb has its intended world position
            baked into Blender.
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
                'standing.glb ready and hidden.'
              );


              /*
                If two items were already placed before
                the GLB finished loading, its visible state
                is already true and it will appear now.
              */
            },

            {
              once:
                true
            }
          );


          this.el.appendChild(
            standing
          );

        } else {
          /*
            Existing entity may already be loaded.
          */

          if (
            standing.getObject3D(
              'mesh'
            )
          ) {
            window
              .roomsMonsterState
              .standingModelReady =
              true;
          }
        }


        this.standingMonster =
          standing;
      },


    /* ========================================================
       CREATE STANDING-SCARE BLACKOUT

       Camera-attached black plane.

       This does NOT use the pause/settings UI and
       does NOT end the game.
    ======================================================== */

    createStandingBlackout:
      function () {
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
          return false;
        }


        let blackout =
          document.querySelector(
            '#roomsStandingMonsterBlackout'
          );


        if (
          !blackout
        ) {
          blackout =
            document
              .createElement(
                'a-plane'
              );


          blackout.setAttribute(
            'id',
            'roomsStandingMonsterBlackout'
          );


          /*
            Very close to camera and deliberately huge.

            This covers the view in desktop and immersive VR.
          */

          blackout.setAttribute(
            'position',
            '0 0 -0.12'
          );


          blackout.setAttribute(
            'width',
            '4'
          );


          blackout.setAttribute(
            'height',
            '4'
          );


          blackout.setAttribute(
            'visible',
            'false'
          );


          blackout.setAttribute(
            'material',

            'color: #000000; ' +
            'opacity: 0; ' +
            'transparent: true; ' +
            'shader: flat; ' +
            'depthTest: false; ' +
            'depthWrite: false; ' +
            'side: double'
          );


          camera.appendChild(
            blackout
          );
        }


        this.blackout =
          blackout;

        this.blackoutOpacity =
          0;


        return true;
      },


    /* ========================================================
       BLACKOUT OPACITY
    ======================================================== */

    setStandingBlackoutOpacity:
      function (
        opacity
      ) {
        if (
          !this.blackout
        ) {
          this.createStandingBlackout();
        }


        if (
          !this.blackout
        ) {
          return;
        }


        const value =
          THREE.MathUtils.clamp(
            Number(
              opacity
            ) || 0,
            0,
            1
          );


        this.blackoutOpacity =
          value;


        this.blackout.setAttribute(
          'visible',
          value >
            0.001
        );


        this.blackout.setAttribute(
          'material',
          'opacity',
          value
        );
      },


    /* ========================================================
       BLACKOUT FADE
    ======================================================== */

    fadeStandingBlackout:
      function (
        targetOpacity,
        duration
      ) {
        return new Promise(
          (resolve) => {
            if (
              !this.blackout
            ) {
              this.createStandingBlackout();
            }


            if (
              !this.blackout
            ) {
              resolve();

              return;
            }


            if (
              this.blackoutAnimationFrame !==
              null
            ) {
              window
                .cancelAnimationFrame(
                  this
                    .blackoutAnimationFrame
                );

              this.blackoutAnimationFrame =
                null;
            }


            const from =
              this.blackoutOpacity;

            const to =
              THREE.MathUtils.clamp(
                Number(
                  targetOpacity
                ) || 0,
                0,
                1
              );

            const length =
              Math.max(
                1,
                Number(
                  duration
                ) || 1
              );

            const started =
              performance.now();


            const step =
              (now) => {
                const progress =
                  THREE.MathUtils.clamp(
                    (
                      now -
                      started
                    ) /
                    length,
                    0,
                    1
                  );


                /*
                  Smoothstep.
                */

                const eased =
                  progress *
                  progress *
                  (
                    3 -
                    2 *
                    progress
                  );


                const value =
                  THREE.MathUtils
                    .lerp(
                      from,
                      to,
                      eased
                    );


                this
                  .setStandingBlackoutOpacity(
                    value
                  );


                if (
                  progress <
                  1
                ) {
                  this.blackoutAnimationFrame =
                    window
                      .requestAnimationFrame(
                        step
                      );

                  return;
                }


                this.blackoutAnimationFrame =
                  null;


                this
                  .setStandingBlackoutOpacity(
                    to
                  );


                resolve();
              };


            this.blackoutAnimationFrame =
              window
                .requestAnimationFrame(
                  step
                );
          }
        );
      },


    /* ========================================================
       FIND BEDROOM + DOOR + TEDDY
    ======================================================== */

    prepare:
      function () {
        /* ----------------------------------------------------
           BEDROOM
        ---------------------------------------------------- */

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


        if (
          this.bedroom &&
          this.bedroom
            .getObject3D(
              'mesh'
            )
        ) {
          this.updateBedroomBox();
        }



        /* ----------------------------------------------------
           DOOR / CUA.GLB
        ---------------------------------------------------- */

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



        /* ----------------------------------------------------
           TEDDY
        ---------------------------------------------------- */

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


          this.teddy
            .addEventListener(
              'stateadded',
              this
                .onTeddyStateAdded
            );
        }


        /*
          Teddy could already be held.
        */

        if (
          roomsMonsterTeddyIsGrabbed()
        ) {
          this.markTeddyGrabbed();
        }


        /*
          Camera might not have existed during init.
        */

        if (
          !this.blackout
        ) {
          this.createStandingBlackout();
        }


        this.syncStandingPlacementState();
      },


    /* ========================================================
       BEDROOM MODEL READY
    ======================================================== */

    onBedroomModelLoaded:
      function () {
        this.updateBedroomBox();
      },


    /* ========================================================
       DOOR MODEL READY
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

       Kept for debug / compatibility only.

       walking.glb now uses the actual cua.glb doorway.
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

          auto-door-proximity already stores the CLOSED
          door box before the door swings open.
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

          Only use the live door model if it is currently closed.
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
          Closed door:
          one horizontal dimension is wide,
          the other is thin.

          Thin dimension = crossing direction.
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

       +1 = one side
       -1 = opposite side
        0 = tiny dead-zone directly on doorway plane
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


        const value =
          player[
            this.doorNormalAxis
          ] -
          this.doorCenter[
            this.doorNormalAxis
          ];


        if (
          value >
          ROOMS_MONSTER_CONFIG
            .doorSideEpsilon
        ) {
          return 1;
        }


        if (
          value <
          -ROOMS_MONSTER_CONFIG
            .doorSideEpsilon
        ) {
          return -1;
        }


        return 0;
      },


    /* ========================================================
       DID MOVEMENT PASS THROUGH DOORWAY?
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
          Movement must actually pass across the door plane.
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


        const horizontalDistance =
          Math.hypot(
            current.x -
              previous.x,

            current.z -
              previous.z
          );


        /*
          Ignore very large teleport jumps.
        */

        if (
          horizontalDistance >
          ROOMS_MONSTER_CONFIG
            .maxDoorCrossDistance
        ) {
          return false;
        }


        /*
          Find where the player's movement line intersects
          the exact door plane.
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
          Historical/debug state only.

          Walking scare now requires Teddy to STILL
          be physically held while crossing the door.
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
            Component may initialize one frame after entity.
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
       STORY ITEM SNAPPED

       story.js emits this when Teddy / Picture / Hair Clipper
       permanently locks onto #truocbantho.
    ======================================================== */

    onStoryItemSnapped:
      function (
        event
      ) {
        if (
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return;
        }


        const detail =
          event &&
          event.detail
            ? event.detail
            : {};


        const key =
          String(
            detail.key ||
            ''
          );


        if (
          !key
        ) {
          return;
        }


        /*
          Set prevents duplicate event calls from counting twice.
        */

        this.standingPlacedItems
          .add(
            key
          );


        window
          .roomsMonsterState
          .standingPlacedCount =
          this.standingPlacedItems
            .size;


        console.log(
          `Standing scare altar count: ${this.standingPlacedItems.size}/3`
        );


        if (
          this.standingPlacedItems
            .size >=
            ROOMS_MONSTER_CONFIG
              .standingRequiredItems
        ) {
          this.showStandingMonster();
        }
      },


    /* ========================================================
       RECOVER PLACEMENT STATE FROM STORY.JS
    ======================================================== */

    syncStandingPlacementState:
      function () {
        if (
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return;
        }


        if (
          typeof window
            .getRoomsStoryState !==
          'function'
        ) {
          return;
        }


        let state =
          null;


        try {
          state =
            window
              .getRoomsStoryState();

        } catch (
          error
        ) {
          return;
        }


        if (
          !state ||
          !Array.isArray(
            state.snapped
          )
        ) {
          return;
        }


        state.snapped
          .forEach(
            (key) => {
              if (
                key
              ) {
                this.standingPlacedItems
                  .add(
                    String(
                      key
                    )
                  );
              }
            }
          );


        window
          .roomsMonsterState
          .standingPlacedCount =
          this.standingPlacedItems
            .size;


        if (
          this.standingPlacedItems
            .size >=
            ROOMS_MONSTER_CONFIG
              .standingRequiredItems
        ) {
          this.showStandingMonster();
        }
      },


    /* ========================================================
       SHOW STANDING.GLB

       Appears immediately after the SECOND unique altar item.
    ======================================================== */

    showStandingMonster:
      function () {
        if (
          window
            .roomsMonsterState
            .standingTriggered ||
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return false;
        }


        const standing =
          this.standingMonster ||
          document.querySelector(
            '#standingMonster'
          );


        if (
          !standing
        ) {
          console.warn(
            'standingMonster entity was not found.'
          );


          return false;
        }


        window
          .roomsMonsterState
          .standingTriggered =
          true;


        window
          .roomsMonsterState
          .standingVisible =
          true;


        window
          .roomsMonsterState
          .standingSeen =
          false;


        standing.setAttribute(
          'visible',
          true
        );


        this.standingShownAt =
          performance.now();


        const detail = {
          placedCount:
            this.standingPlacedItems
              .size,

          placed:
            Array.from(
              this.standingPlacedItems
            )
        };


        this.el.emit(
          'rooms-standing-monster-visible',
          detail,
          false
        );


        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl.emit(
            'rooms-standing-monster-visible',
            detail,
            false
          );
        }


        console.log(
          'MONSTER: standing.glb appeared after 2 altar items.'
        );


        return true;
      },


    /* ========================================================
       IS PLAYER ACTUALLY LOOKING AT STANDING.GLB?
    ======================================================== */

    isPlayerLookingAtStanding:
      function () {
        if (
          !window
            .roomsMonsterState
            .standingVisible ||
          window
            .roomsMonsterState
            .standingSeen ||
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return false;
        }


        /*
          Do not let her disappear the exact frame she appears.
        */

        if (
          performance.now() -
            this.standingShownAt <
          ROOMS_MONSTER_CONFIG
            .standingMinimumVisibleTime
        ) {
          return false;
        }


        const standing =
          this.standingMonster ||
          document.querySelector(
            '#standingMonster'
          );


        const cameraEntity =
          document.querySelector(
            '#cam'
          ) ||
          document.querySelector(
            '[camera]'
          );


        if (
          !standing ||
          !cameraEntity
        ) {
          return false;
        }


        const standingBox =
          roomsMonsterWorldBox(
            standing
          );


        if (
          !standingBox
        ) {
          return false;
        }


        standingBox.getCenter(
          this.standingCenter
        );


        /*
          Use the actual THREE camera object when possible.

          THREE.Camera.getWorldDirection correctly gives
          the visual forward direction (-Z).
        */

        const cameraObject =
          cameraEntity.getObject3D(
            'camera'
          ) ||
          cameraEntity.object3D;


        if (
          !cameraObject
        ) {
          return false;
        }


        cameraObject
          .getWorldPosition(
            this
              .standingCameraPosition
          );


        this.standingDirectionToMonster
          .subVectors(
            this.standingCenter,
            this.standingCameraPosition
          );


        const distance =
          this.standingDirectionToMonster
            .length();


        if (
          distance <=
            0.001 ||
          distance >
            ROOMS_MONSTER_CONFIG
              .standingLookMaxDistance
        ) {
          return false;
        }


        this.standingDirectionToMonster
          .normalize();


        cameraObject
          .getWorldDirection(
            this.standingLookDirection
          );


        this.standingLookDirection
          .normalize();


        const dot =
          this.standingLookDirection
            .dot(
              this
                .standingDirectionToMonster
            );


        const minimumDot =
          Math.cos(
            THREE.MathUtils
              .degToRad(
                ROOMS_MONSTER_CONFIG
                  .standingLookAngle
              )
          );


        return Boolean(
          dot >=
          minimumDot
        );
      },


    /* ========================================================
       PLAYER SAW STANDING.GLB
    ======================================================== */

    triggerStandingSeen:
      function () {
        if (
          !window
            .roomsMonsterState
            .standingVisible ||
          window
            .roomsMonsterState
            .standingSeen ||
          window
            .roomsMonsterState
            .standingBlackoutRunning ||
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return false;
        }


        window
          .roomsMonsterState
          .standingSeen =
          true;


        const detail = {
          placedCount:
            this.standingPlacedItems
              .size,

          placed:
            Array.from(
              this.standingPlacedItems
            )
        };


        this.el.emit(
          'rooms-standing-monster-seen',
          detail,
          false
        );


        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl.emit(
            'rooms-standing-monster-seen',
            detail,
            false
          );
        }


        console.log(
          'MONSTER: player looked at standing.glb.'
        );


        this.runStandingDisappearSequence();


        return true;
      },


    /* ========================================================
       BLACKOUT -> HIDE HER -> RETURN

       IMPORTANT ORDER:

       1. Fade to black.
       2. Stay fully black.
       3. Hide standing.glb.
       4. Stay black.
       5. Fade back in.

       The player never sees the model pop out of existence.
    ======================================================== */

    runStandingDisappearSequence:
      async function () {
        if (
          window
            .roomsMonsterState
            .standingBlackoutRunning ||
          window
            .roomsMonsterState
            .standingFinished
        ) {
          return false;
        }


        window
          .roomsMonsterState
          .standingBlackoutRunning =
          true;


        /*
          STEP 1:
          Quickly fade to full black.
        */

        await this
          .fadeStandingBlackout(
            1,
            ROOMS_MONSTER_CONFIG
              .standingBlackFadeIn
          );


        /*
          STEP 2:
          Screen is fully black.

          Keep her PRESENT for a short moment before hiding.
        */

        await roomsMonsterWait(
          ROOMS_MONSTER_CONFIG
            .standingBlackBeforeHide
        );


        /*
          STEP 3:
          NOW remove her.

          This happens while opacity is still exactly 1.
        */

        const standing =
          this.standingMonster ||
          document.querySelector(
            '#standingMonster'
          );


        if (
          standing
        ) {
          standing.setAttribute(
            'visible',
            false
          );
        }


        window
          .roomsMonsterState
          .standingVisible =
          false;


        this.el.emit(
          'rooms-standing-monster-hidden',
          {
            reason:
              'player-looked-at-standing'
          },
          false
        );


        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl.emit(
            'rooms-standing-monster-hidden',
            {
              reason:
                'player-looked-at-standing'
            },
            false
          );
        }


        /*
          STEP 4:
          Keep screen fully black AFTER she is gone.
        */

        await roomsMonsterWait(
          ROOMS_MONSTER_CONFIG
            .standingBlackAfterHide
        );


        /*
          STEP 5:
          Fade vision back in.

          The location is now empty.
        */

        await this
          .fadeStandingBlackout(
            0,
            ROOMS_MONSTER_CONFIG
              .standingBlackFadeOut
          );


        window
          .roomsMonsterState
          .standingBlackoutRunning =
          false;


        window
          .roomsMonsterState
          .standingFinished =
          true;


        const detail = {
          placedCount:
            this.standingPlacedItems
              .size
        };


        this.el.emit(
          'rooms-standing-monster-finished',
          detail,
          false
        );


        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl.emit(
            'rooms-standing-monster-finished',
            detail,
            false
          );
        }


        console.log(
          'MONSTER: blackout ended. standing.glb is gone.'
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
          Retry initialization occasionally.
        */

        if (
          (
            !window
              .roomsMonsterState
              .doorReady ||
            !this.blackout
          ) &&
          time -
            this.lastPrepareAttempt >=
            500
        ) {
          this.lastPrepareAttempt =
            time;


          this.prepare();
        }


        /* ----------------------------------------------------
           STANDING MONSTER LOOK CHECK
        ---------------------------------------------------- */

        if (
          window
            .roomsMonsterState
            .standingVisible &&
          !window
            .roomsMonsterState
            .standingSeen &&
          !window
            .roomsMonsterState
            .standingBlackoutRunning
        ) {
          if (
            this
              .isPlayerLookingAtStanding()
          ) {
            this
              .triggerStandingSeen();
          }
        }


        /* ----------------------------------------------------
           PLAYER WORLD POSITION
        ---------------------------------------------------- */

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
           BEDROOM DEBUG / COMPATIBILITY
        ---------------------------------------------------- */

        if (
          window
            .roomsMonsterState
            .bedroomReady
        ) {
          const inside =
            this
              .isPlayerInsideBedroom(
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
           TEDDY CURRENT HOLD STATE
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
           DOOR CURRENT STATE
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
            ? this
                .getDoorSide(
                  player
                )
            : 0;


        window
          .roomsMonsterState
          .doorSide =
          currentDoorSide;


        /* ----------------------------------------------------
           ARM TEDDY DOOR DIRECTION
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
           WALKING MONSTER TRIGGER

           Required:
           - Teddy STILL held
           - cua.glb currently open
           - player crossed from Teddy's original side
             to the opposite side
           - actual movement path crossed doorway
           - event has never happened before
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
          this
            .triggerWalkingMonster();
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


        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl
            .removeEventListener(
              'story-item-snapped',
              this
                .onStoryItemSnapped
            );
        }


        if (
          this.blackoutAnimationFrame !==
          null
        ) {
          window
            .cancelAnimationFrame(
              this
                .blackoutAnimationFrame
            );


          this.blackoutAnimationFrame =
            null;
        }


        if (
          this.blackout &&
          this.blackout.parentNode
        ) {
          this.blackout.remove();
        }


        this.blackout =
          null;
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
      /* ------------------------------------------------------
         BEDROOM / TEDDY / DOOR
      ------------------------------------------------------ */

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


      teddyCurrentlyHeld:
        window
          .roomsMonsterState
          .teddyCurrentlyHeld,


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
          ? system
              .doorBox
              .min
              .toArray()
          : null,


      doorBoxMax:
        system &&
        window
          .roomsMonsterState
          .doorReady
          ? system
              .doorBox
              .max
              .toArray()
          : null,


      /* ------------------------------------------------------
         WALKING MONSTER
      ------------------------------------------------------ */

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


      walkingEntityFound:
        Boolean(
          document.querySelector(
            '#walkingMonster'
          )
        ),


      /* ------------------------------------------------------
         STANDING MONSTER
      ------------------------------------------------------ */

      standingModelReady:
        window
          .roomsMonsterState
          .standingModelReady,


      standingPlacedCount:
        window
          .roomsMonsterState
          .standingPlacedCount,


      standingPlacedItems:
        system
          ? Array.from(
              system
                .standingPlacedItems
            )
          : [],


      standingTriggered:
        window
          .roomsMonsterState
          .standingTriggered,


      standingVisible:
        window
          .roomsMonsterState
          .standingVisible,


      standingSeen:
        window
          .roomsMonsterState
          .standingSeen,


      standingBlackoutRunning:
        window
          .roomsMonsterState
          .standingBlackoutRunning,


      standingFinished:
        window
          .roomsMonsterState
          .standingFinished,


      standingEntityFound:
        Boolean(
          document.querySelector(
            '#standingMonster'
          )
        ),


      standingBlackoutFound:
        Boolean(
          document.querySelector(
            '#roomsStandingMonsterBlackout'
          )
        ),


      /* ------------------------------------------------------
         SYSTEM
      ------------------------------------------------------ */

      systemReady:
        Boolean(
          system
        )
    };
  };


/* ============================================================
   MANUAL WALKING MONSTER TEST

   Browser console:

   triggerRoomsWalkingMonster()
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
   MANUAL STANDING MONSTER TEST

   Browser console:

   triggerRoomsStandingMonster()

   Shows standing.glb without requiring two altar items.

   Looking at her will still activate the blackout normally.
============================================================ */

window.triggerRoomsStandingMonster =
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
      .showStandingMonster();
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