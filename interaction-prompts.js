/* ============================================================
   interaction-prompts.js — ROOMS WITHIN
   FULL REPLACEMENT

   STANDALONE TV VERSION

   PROMPTS:

   TV OFF:
   TURN ON THE TV

   TV ON:
   TURN OFF THE TV

   TEDDY:
   PICK UP THE TEDDY

   NOT INCLUDED:
   - DROP THE TEDDY
   - PICK UP THE INCENSE
   - DROP THE INCENSE

   Incense interaction text remains handled by incense.js.

   IMPORTANT:
   - #tv is now the actual standalone tv.glb entity.
   - There is NO #tvScreenHitbox.
   - #living is no longer treated as the television.
============================================================ */


/* ============================================================
   SHARED HELPERS
============================================================ */

function roomsPromptGameplayLocked() {

  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );

}


function roomsPromptIsImmersiveXR(
  scene
) {

  try {

    return Boolean(

      scene &&

      scene.renderer &&

      scene.renderer.xr &&

      (
        scene.renderer.xr.isPresenting ||

        (
          scene.renderer.xr.getSession &&
          scene.renderer.xr.getSession()
        )
      )

    );

  }

  catch (
    error
  ) {

    return false;

  }

}



/* ============================================================
   INTERACTION PROMPT MANAGER
============================================================ */

AFRAME.registerComponent(
  'rooms-click-prompts',
  {

    init:
      function () {

        this.scene =
          this.el.sceneEl;


        this.camera =
          document
            .querySelector(
              '#cam'
            );


        this.cursor =
          document
            .querySelector(
              'a-cursor'
            );


        this.rightHand =
          document
            .querySelector(
              '#rightHand'
            );


        /*
          Standalone TV entity.
        */

        this.tv =
          document
            .querySelector(
              '#tv'
            );


        this.teddy =
          document
            .querySelector(
              '#teddy'
            );


        this.promptRoot =
          null;


        this.promptText =
          null;


        this.currentPrompt =
          '';


        this.lastCheck =
          0;


        this.createPrompt();


        console.log(

          'Interaction prompts loaded.',

          {

            camera:
              Boolean(
                this.camera
              ),


            cursor:
              Boolean(
                this.cursor
              ),


            rightHand:
              Boolean(
                this.rightHand
              ),


            tv:
              Boolean(
                this.tv
              ),


            teddy:
              Boolean(
                this.teddy
              )

          }

        );

      },



    /* ========================================================
       CREATE PROMPT

       Camera-attached text.

       It appears underneath the reticle.
    ======================================================== */

    createPrompt:
      function () {

        if (
          !this.camera
        ) {

          console.warn(
            'Interaction prompts: #cam not found.'
          );


          return;

        }


        const oldPrompt =
          document
            .querySelector(
              '#roomsInteractionPrompt'
            );


        if (
          oldPrompt &&
          oldPrompt.parentNode
        ) {

          oldPrompt
            .parentNode
            .removeChild(
              oldPrompt
            );

        }


        const root =
          document
            .createElement(
              'a-entity'
            );


        root
          .setAttribute(
            'id',
            'roomsInteractionPrompt'
          );


        /*
          X = horizontal
          Y = vertical
          Z = distance from camera
        */

        root
          .setAttribute(
            'position',
            '0 -0.055 -0.75'
          );


        root
          .setAttribute(
            'visible',
            false
          );


        const text =
          document
            .createElement(
              'a-text'
            );


        text
          .setAttribute(
            'value',
            ''
          );


        text
          .setAttribute(
            'font',
            'exo2semibold'
          );


        text
          .setAttribute(
            'align',
            'center'
          );


        text
          .setAttribute(
            'anchor',
            'center'
          );


        text
          .setAttribute(
            'baseline',
            'center'
          );


        text
          .setAttribute(
            'color',
            '#f4f1e8'
          );


        text
          .setAttribute(
            'width',
            '0.38'
          );


        text
          .setAttribute(
            'wrap-count',
            '28'
          );


        text
          .setAttribute(
            'position',
            '0 0 0'
          );


        text
          .setAttribute(

            'material',

            `
              shader: flat;
              depthTest: false;
              depthWrite: false
            `

          );


        root
          .appendChild(
            text
          );


        this.camera
          .appendChild(
            root
          );


        this.promptRoot =
          root;


        this.promptText =
          text;

      },



    /* ========================================================
       SHOW PROMPT
    ======================================================== */

    showPrompt:
      function (
        value
      ) {

        if (
          !this.promptRoot ||
          !this.promptText ||
          !value ||
          roomsPromptGameplayLocked()
        ) {

          return;

        }


        if (
          this.currentPrompt !==
          value
        ) {

          this.currentPrompt =
            value;


          this.promptText
            .setAttribute(
              'value',
              value
            );

        }


        this.promptRoot
          .setAttribute(
            'visible',
            true
          );

      },



    /* ========================================================
       HIDE PROMPT
    ======================================================== */

    hidePrompt:
      function () {

        if (
          !this.promptRoot
        ) {
          return;
        }


        this.promptRoot
          .setAttribute(
            'visible',
            false
          );


        this.currentPrompt =
          '';

      },



    /* ========================================================
       GET TV COMPONENT
    ======================================================== */

    getTVComponent:
      function () {

        if (
          !this.tv ||
          !this.tv.components
        ) {

          return null;

        }


        return (

          this.tv
            .components[
              'embedded-tv'
            ] ||

          null

        );

      },



    /* ========================================================
       TV READY?
    ======================================================== */

    tvIsReady:
      function () {

        const component =
          this
            .getTVComponent();


        return Boolean(

          this.tv &&

          component &&

          component.ready

        );

      },



    /* ========================================================
       TV PROMPT TEXT
    ======================================================== */

    getTVPromptText:
      function () {

        const component =
          this
            .getTVComponent();


        if (
          component &&
          component.isOn
        ) {

          return (
            'TURN OFF THE TV'
          );

        }


        return (
          'TURN ON THE TV'
        );

      },



    /* ========================================================
       TEDDY HELD?
    ======================================================== */

    teddyIsHeld:
      function () {

        if (
          !this.teddy ||
          !this.teddy.components
        ) {

          return false;

        }


        const grabbable =
          this.teddy
            .components[
              'natural-grabbable'
            ];


        return Boolean(

          grabbable &&

          grabbable.heldBy

        );

      },



    /* ========================================================
       OBJECT BELONGS TO ENTITY

       Used as fallback verification for raycast intersections.
    ======================================================== */

    objectBelongsTo:
      function (
        object,
        entity
      ) {

        if (
          !object ||
          !entity
        ) {

          return false;

        }


        const root =
          entity
            .getObject3D(
              'mesh'
            ) ||

          entity
            .object3D;


        if (
          !root
        ) {

          return false;

        }


        let current =
          object;


        while (
          current
        ) {

          if (
            current ===
            root
          ) {

            return true;

          }


          current =
            current.parent;

        }


        return false;

      },



    /* ========================================================
       GET RAYCAST INTERSECTION

       Asks one raycaster for one specific entity.
    ======================================================== */

    getIntersection:
      function (
        rayEntity,
        target
      ) {

        if (
          !rayEntity ||
          !target ||
          !rayEntity.components
        ) {

          return null;

        }


        const raycaster =
          rayEntity
            .components[
              'raycaster'
            ];


        if (
          !raycaster
        ) {

          return null;

        }


        if (
          raycaster.refreshObjects
        ) {

          raycaster
            .refreshObjects();

        }


        /*
          Preferred A-Frame method.
        */

        if (
          raycaster.getIntersection
        ) {

          const directHit =
            raycaster
              .getIntersection(
                target
              );


          if (
            directHit
          ) {

            return directHit;

          }

        }


        /*
          Fallback:
          inspect all current intersections.
        */

        const intersections =
          raycaster.intersections ||
          [];


        for (
          let index = 0;

          index <
          intersections.length;

          index++
        ) {

          const hit =
            intersections[
              index
            ];


          if (
            hit &&
            hit.object &&
            this.objectBelongsTo(
              hit.object,
              target
            )
          ) {

            return hit;

          }

        }


        return null;

      },



    /* ========================================================
       DESKTOP TV PROMPT
    ======================================================== */

    getDesktopTVPrompt:
      function () {

        if (
          !this.tvIsReady() ||
          !this.cursor ||
          !this.tv
        ) {

          return null;

        }


        const hit =
          this
            .getIntersection(
              this.cursor,
              this.tv
            );


        if (
          !hit
        ) {

          return null;

        }


        return this
          .getTVPromptText();

      },



    /* ========================================================
       DESKTOP TEDDY PROMPT
    ======================================================== */

    getDesktopTeddyPrompt:
      function () {

        if (
          !this.teddy ||
          !this.cursor ||
          this.teddyIsHeld()
        ) {

          return null;

        }


        const hit =
          this
            .getIntersection(
              this.cursor,
              this.teddy
            );


        if (
          !hit
        ) {

          return null;

        }


        return (
          'PICK UP THE TEDDY'
        );

      },



    /* ========================================================
       DESKTOP UPDATE
    ======================================================== */

    updateDesktop:
      function () {

        /*
          TV has priority over teddy.
        */

        const tvPrompt =
          this
            .getDesktopTVPrompt();


        if (
          tvPrompt
        ) {

          this
            .showPrompt(
              tvPrompt
            );


          return;

        }


        const teddyPrompt =
          this
            .getDesktopTeddyPrompt();


        if (
          teddyPrompt
        ) {

          this
            .showPrompt(
              teddyPrompt
            );


          return;

        }


        this
          .hidePrompt();

      },



    /* ========================================================
       QUEST TV PROMPT

       Quest uses the right-hand ray.

       Teddy does not show a ray prompt in VR because the teddy
       is picked up naturally using the grip.
    ======================================================== */

    getQuestTVPrompt:
      function () {

        if (
          !this.tvIsReady() ||
          !this.rightHand ||
          !this.tv
        ) {

          return null;

        }


        const hit =
          this
            .getIntersection(
              this.rightHand,
              this.tv
            );


        if (
          !hit
        ) {

          return null;

        }


        return this
          .getTVPromptText();

      },



    /* ========================================================
       QUEST UPDATE
    ======================================================== */

    updateQuest:
      function () {

        const tvPrompt =
          this
            .getQuestTVPrompt();


        if (
          tvPrompt
        ) {

          this
            .showPrompt(
              tvPrompt
            );


          return;

        }


        this
          .hidePrompt();

      },



    /* ========================================================
       REFRESH REFERENCES

       Useful if models/components initialize after this script.
    ======================================================== */

    refreshReferences:
      function () {

        if (
          !this.camera
        ) {

          this.camera =
            document
              .querySelector(
                '#cam'
              );

        }


        if (
          !this.cursor
        ) {

          this.cursor =
            document
              .querySelector(
                'a-cursor'
              );

        }


        if (
          !this.rightHand
        ) {

          this.rightHand =
            document
              .querySelector(
                '#rightHand'
              );

        }


        if (
          !this.tv
        ) {

          this.tv =
            document
              .querySelector(
                '#tv'
              );

        }


        if (
          !this.teddy
        ) {

          this.teddy =
            document
              .querySelector(
                '#teddy'
              );

        }

      },



    /* ========================================================
       TICK
    ======================================================== */

    tick:
      function (
        time
      ) {

        /*
          20 checks per second.

          This is responsive enough for interaction text while
          remaining lightweight on Quest.
        */

        if (
          time -
            this.lastCheck <
          50
        ) {

          return;

        }


        this.lastCheck =
          time;


        if (
          roomsPromptGameplayLocked()
        ) {

          this
            .hidePrompt();


          return;

        }


        this
          .refreshReferences();


        if (
          roomsPromptIsImmersiveXR(
            this.scene
          )
        ) {

          this
            .updateQuest();

        } else {

          this
            .updateDesktop();

        }

      },



    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {

        if (
          this.promptRoot &&
          this.promptRoot
            .parentNode
        ) {

          this.promptRoot
            .parentNode
            .removeChild(
              this.promptRoot
            );

        }


        this.promptRoot =
          null;


        this.promptText =
          null;


        this.currentPrompt =
          '';

      }

  }
);



/* ============================================================
   AUTOMATIC SETUP
============================================================ */

function setupRoomsClickPrompts() {

  const scene =
    document
      .querySelector(
        'a-scene'
      );


  if (
    !scene
  ) {

    console.error(
      'Interaction prompts: a-scene not found.'
    );


    return;

  }


  if (
    !scene
      .hasAttribute(
        'rooms-click-prompts'
      )
  ) {

    scene
      .setAttribute(
        'rooms-click-prompts',
        ''
      );

  }


  console.log(
    'Rooms prompts ready: standalone TV + teddy.'
  );

}



/* ============================================================
   DEBUG

   Browser console:

   getRoomsPromptDebug()
============================================================ */

function getRoomsPromptDebug() {

  const scene =
    document
      .querySelector(
        'a-scene'
      );


  const tv =
    document
      .querySelector(
        '#tv'
      );


  const teddy =
    document
      .querySelector(
        '#teddy'
      );


  const manager =
    scene &&
    scene.components

      ? scene.components[
          'rooms-click-prompts'
        ]

      : null;


  const tvComponent =
    tv &&
    tv.components

      ? tv.components[
          'embedded-tv'
        ]

      : null;


  return {

    promptManagerReady:
      Boolean(
        manager
      ),


    tvFound:
      Boolean(
        tv
      ),


    tvComponentReady:
      Boolean(
        tvComponent
      ),


    tvModelReady:
      Boolean(
        tvComponent &&
        tvComponent.ready
      ),


    tvOn:
      Boolean(
        tvComponent &&
        tvComponent.isOn
      ),


    teddyFound:
      Boolean(
        teddy
      ),


    teddyHeld:
      Boolean(

        teddy &&

        teddy.components &&

        teddy.components[
          'natural-grabbable'
        ] &&

        teddy.components[
          'natural-grabbable'
        ].heldBy

      ),


    currentPrompt:
      manager

        ? manager.currentPrompt

        : null,


    immersiveXR:
      roomsPromptIsImmersiveXR(
        scene
      )

  };

}


window.getRoomsPromptDebug =
  getRoomsPromptDebug;



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


    if (
      !scene
    ) {
      return;
    }


    if (
      scene.hasLoaded
    ) {

      setupRoomsClickPrompts();

    } else {

      scene
        .addEventListener(

          'loaded',

          setupRoomsClickPrompts,

          {
            once: true
          }

        );

    }

  }
);