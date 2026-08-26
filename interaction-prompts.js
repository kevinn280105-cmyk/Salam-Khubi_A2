/* ============================================================
   interaction-prompts.js — ROOMS WITHIN

   Reliable interaction prompts.

   TV OFF  -> TURN ON THE TV
   TV ON   -> TURN OFF THE TV
   Teddy   -> PICK UP THE TEDDY

   Not included:
   - DROP THE TEDDY
   - PICK UP THE INCENSE
   - DROP THE INCENSE

   Existing altar prompt remains in incense.js:
   LIGHT UP THE INCENSE
============================================================ */


/* ============================================================
   HELPERS
============================================================ */

function roomsPromptLocked() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function roomsPromptInXR(scene) {
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

  catch (error) {
    return false;
  }
}


/* ============================================================
   INTERACTION PROMPT MANAGER
============================================================ */

AFRAME.registerComponent(
  'rooms-click-prompts',
  {
    init: function () {

      this.camera =
        document.querySelector(
          '#cam'
        );


      this.cursor =
        document.querySelector(
          'a-cursor'
        );


      this.rightHand =
        document.querySelector(
          '#rightHand'
        );


      this.tv =
        document.querySelector(
          '#living'
        );


      this.teddy =
        document.querySelector(
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
        'Interaction prompt system loaded.',
        {
          camera: Boolean(this.camera),
          cursor: Boolean(this.cursor),
          rightHand: Boolean(this.rightHand),
          tv: Boolean(this.tv),
          teddy: Boolean(this.teddy)
        }
      );
    },


    /* ======================================================
       CREATE TEXT

       Same style as LIGHT UP THE INCENSE.
    ====================================================== */

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


        const root =
          document.createElement(
            'a-entity'
          );


        root.setAttribute(
          'id',
          'roomsInteractionPrompt'
        );


        /*
          Slightly below the centre reticle.
        */

        root.setAttribute(
          'position',
          '0 -0.055 -0.75'
        );


        root.setAttribute(
          'visible',
          false
        );


        const text =
          document.createElement(
            'a-text'
          );


        text.setAttribute(
          'value',
          ''
        );


        text.setAttribute(
          'font',
          'exo2semibold'
        );


        text.setAttribute(
          'align',
          'center'
        );


        text.setAttribute(
          'anchor',
          'center'
        );


        text.setAttribute(
          'baseline',
          'center'
        );


        text.setAttribute(
          'color',
          '#f4f1e8'
        );


        /*
          Slightly larger than before
          so it is easier to see.
        */

        text.setAttribute(
          'width',
          '0.38'
        );


        text.setAttribute(
          'wrap-count',
          '20'
        );


        text.setAttribute(
          'position',
          '0 0 0'
        );


        text.setAttribute(
          'material',
          `
            shader: flat;
            depthTest: false;
            depthWrite: false
          `
        );


        root.appendChild(
          text
        );


        this.camera.appendChild(
          root
        );


        this.promptRoot =
          root;


        this.promptText =
          text;
      },


    /* ======================================================
       SHOW
    ====================================================== */

    showPrompt:
      function (
        value
      ) {

        if (
          !this.promptRoot ||
          !this.promptText ||
          !value
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


    /* ======================================================
       HIDE
    ====================================================== */

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


    /* ======================================================
       TV TEXT
    ====================================================== */

    getTVText:
      function () {

        if (
          !this.tv
        ) {
          return (
            'TURN ON THE TV'
          );
        }


        const tvComponent =
          this.tv.components

            ? this.tv.components[
                'embedded-tv'
              ]

            : null;


        if (
          tvComponent &&
          tvComponent.isOn
        ) {
          return (
            'TURN OFF THE TV'
          );
        }


        return (
          'TURN ON THE TV'
        );
      },


    /* ======================================================
       GET INTERSECTION

       Uses the raycaster component
       directly rather than relying on
       mouseenter events.
    ====================================================== */

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
          rayEntity.components[
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
          raycaster.refreshObjects();
        }


        if (
          raycaster.getIntersection
        ) {
          return (
            raycaster.getIntersection(
              target
            ) ||
            null
          );
        }


        return null;
      },


    /* ======================================================
       TEDDY IS HELD?
    ====================================================== */

    teddyIsHeld:
      function () {

        if (
          !this.teddy ||
          !this.teddy.components
        ) {
          return false;
        }


        const component =
          this.teddy.components[
            'natural-grabbable'
          ];


        return Boolean(
          component &&
          component.heldBy
        );
      },


    /* ======================================================
       DESKTOP CHECK
    ====================================================== */

    updateDesktopPrompt:
      function () {

        /*
          First priority:
          TV.
        */

        const tvHit =
          this.getIntersection(
            this.cursor,
            this.tv
          );


        if (
          tvHit
        ) {
          this.showPrompt(
            this.getTVText()
          );

          return;
        }


        /*
          Second priority:
          Teddy.
        */

        if (
          !this.teddyIsHeld()
        ) {

          const teddyHit =
            this.getIntersection(
              this.cursor,
              this.teddy
            );


          if (
            teddyHit
          ) {
            this.showPrompt(
              'PICK UP THE TEDDY'
            );

            return;
          }
        }


        this.hidePrompt();
      },


    /* ======================================================
       QUEST CHECK

       The right-controller ray already
       targets .tv-interactable.

       Teddy is grabbed physically with
       the grip, so we do not show a
       click prompt for Teddy in Quest.
    ====================================================== */

    updateQuestPrompt:
      function () {

        const tvHit =
          this.getIntersection(
            this.rightHand,
            this.tv
          );


        if (
          tvHit
        ) {
          this.showPrompt(
            this.getTVText()
          );

          return;
        }


        this.hidePrompt();
      },


    /* ======================================================
       UPDATE
    ====================================================== */

    tick:
      function (
        time
      ) {

        /*
          Checking ~20 times/second is
          plenty for a UI prompt and
          cheaper for Quest.
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
          roomsPromptLocked()
        ) {
          this.hidePrompt();

          return;
        }


        if (
          roomsPromptInXR(
            this.el.sceneEl
          )
        ) {
          this.updateQuestPrompt();
        }

        else {
          this.updateDesktopPrompt();
        }
      },


    /* ======================================================
       REMOVE
    ====================================================== */

    remove:
      function () {

        if (
          this.promptRoot &&
          this.promptRoot.parentNode
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
      }
  }
);


/* ============================================================
   SETUP
============================================================ */

function setupRoomsClickPrompts() {

  const scene =
    document.querySelector(
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
    !scene.hasAttribute(
      'rooms-click-prompts'
    )
  ) {
    scene.setAttribute(
      'rooms-click-prompts',
      ''
    );
  }


  console.log(
    'Rooms interaction prompts ready.'
  );
}


/* ============================================================
   START
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
      setupRoomsClickPrompts();
    }

    else {
      scene.addEventListener(
        'loaded',
        setupRoomsClickPrompts,

        {
          once:
            true
        }
      );
    }
  }
);