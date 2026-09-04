/* ============================================================
   monster.js — ROOMS WITHIN

   Event:
   - Enter bedroom.
   - Physically grab Teddy at least once.
   - Leave bedroom.
   - walking.glb appears at its baked Blender world position.
   - Its walk animation plays once, then it disappears.
   - Happens only once.

   standing.glb is loaded hidden for a later event.
============================================================ */

const ROOMS_MONSTER_CONFIG = {
  bedroomSelector: '#bedroom',
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

  bedroomReady: false
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

      this.teddy =
        null;

      this.walkingMonster =
        null;

      this.standingMonster =
        null;


      this.bedroomBox =
        new THREE.Box3();


      this.playerWorld =
        new THREE.Vector3();


      this.lastCheck =
        0;


      /*
        null =
        we have not sampled the player's room position yet.
      */

      this.previousInside =
        null;


      this.onBedroomModelLoaded =
        this
          .onBedroomModelLoaded
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
        Find bedroom / Teddy.
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

            You told me walking.glb already has
            the intended scene position baked into Blender,
            beside / left of bantho.

            So it stays:
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
       FIND BEDROOM + TEDDY
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
       BEDROOM BOUNDARY
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


        console.log(
          'Bedroom monster trigger ready.',

          {
            min:
              this.bedroomBox
                .min
                .toArray(),

            max:
              this.bedroomBox
                .max
                .toArray()
          }
        );


        return true;
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
          Remember permanently.

          Teddy does NOT need to still be held
          when the player leaves.
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
    ======================================================== */

    isPlayerInsideBedroom:
      function () {
        if (
          !window
            .roomsMonsterState
            .bedroomReady
        ) {
          return false;
        }


        const player =
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


        /*
          Only apply inset when room is large enough.
        */

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


        /*
          Y is intentionally ignored.

          We only care whether the player's
          X/Z location is inside the bedroom.
        */

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
              'left-bedroom-after-teddy'
          },

          false
        );


        console.log(
          'MONSTER: walking.glb triggered after leaving the bedroom.'
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
          Bedroom model not ready yet?
          Keep trying.
        */

        if (
          !window
            .roomsMonsterState
            .bedroomReady
        ) {
          this.prepare();


          if (
            !window
              .roomsMonsterState
              .bedroomReady
          ) {
            return;
          }
        }


        /*
          Poll Teddy as a safety fallback.
        */

        if (
          !window
            .roomsMonsterState
            .teddyGrabbed &&

          roomsMonsterTeddyIsGrabbed()
        ) {
          this.markTeddyGrabbed();
        }


        const inside =
          this.isPlayerInsideBedroom();


        window
          .roomsMonsterState
          .playerInsideBedroom =
          inside;


        /* ----------------------------------------------------
           FIRST CHECK
        ---------------------------------------------------- */

        if (
          this.previousInside ===
          null
        ) {
          this.previousInside =
            inside;


          /*
            If player starts inside bedroom,
            count that as entering.
          */

          if (
            inside
          ) {
            window
              .roomsMonsterState
              .hasEnteredBedroom =
              true;
          }


          return;
        }


        /* ----------------------------------------------------
           PLAYER ENTERED BEDROOM

           outside -> inside
        ---------------------------------------------------- */

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


        /* ----------------------------------------------------
           PLAYER LEFT BEDROOM

           inside -> outside

           Only trigger if Teddy has actually
           been physically grabbed.
        ---------------------------------------------------- */

        if (
          this.previousInside &&

          !inside &&

          window
            .roomsMonsterState
            .hasEnteredBedroom &&

          window
            .roomsMonsterState
            .teddyGrabbed &&

          !window
            .roomsMonsterState
            .walkingTriggered
        ) {
          this.triggerWalkingMonster();
        }


        this.previousInside =
          inside;
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