/* ============================================================
   story.js — ROOMS WITHIN
   FULL REPLACEMENT

   Five story milestones:
   1. Teddy picked up.
   2. TV turned on.
   3. Mirror inspected.
   4. Incense lit.
   5. Offering completed.

   When all five are complete:
   - #story-manager emits "all-clues-collected"
   - the scene emits "story-completed"

   ui-scare.js listens to "all-clues-collected" for the
   final jumpscare sequence.
============================================================ */


/* ============================================================
   STORY DEFINITION
============================================================ */

const ROOMS_STORY_MILESTONES = [
  'teddy',
  'tv',
  'mirror',
  'incense-lit',
  'offering'
];


const ROOMS_STORY_LABELS = {
  teddy: 'Teddy picked up',
  tv: 'TV turned on',
  mirror: 'Mirror inspected',
  'incense-lit': 'Incense lit',
  offering: 'Offering completed'
};


/* ============================================================
   STORY MANAGER
============================================================ */

AFRAME.registerComponent(
  'story-manager',
  {
    init: function () {
      this.collected =
        new Set();

      this.completed =
        false;

      this.removed =
        false;

      this.listeners =
        [];

      this.boundEvents =
        new WeakMap();

      this.bindCurrentStory =
        this.bindCurrentStory
          .bind(this);

      this.onTeddyStateAdded =
        this.onTeddyStateAdded
          .bind(this);

      this.onTVStateChanged =
        this.onTVStateChanged
          .bind(this);

      this.onMirrorInspected =
        this.onMirrorInspected
          .bind(this);

      this.onIncenseLit =
        this.onIncenseLit
          .bind(this);

      this.onOfferingCompleted =
        this.onOfferingCompleted
          .bind(this);

      this.onSceneLoaded =
        this.onSceneLoaded
          .bind(this);

      this.bindCurrentStory();

      /*
        Re-bind once the scene is fully loaded.

        listen() prevents duplicate event bindings,
        so this is safe if some components initialize
        slightly later on Quest.
      */

      if (
        this.el.sceneEl &&
        !this.el.sceneEl.hasLoaded
      ) {
        this.el.sceneEl
          .addEventListener(
            'loaded',
            this.onSceneLoaded,
            {
              once: true
            }
          );
      }

      window.setTimeout(
        this.bindCurrentStory,
        250
      );

      window.setTimeout(
        this.bindCurrentStory,
        1000
      );

      /*
        Debug command:

        getRoomsStoryState()
      */

      window.getRoomsStoryState =
        () => this.getState();

      /*
        Pretty console debug:

        printRoomsStoryDebug()
      */

      window.printRoomsStoryDebug =
        () => {
          const state =
            this.getState();

          console.log(
            'Rooms Within story state:',
            state
          );

          return state;
        };

      console.log(
        'Story manager ready: 5 milestones.'
      );
    },


    onSceneLoaded: function () {
      this.bindCurrentStory();
    },


    /* ========================================================
       SAFE EVENT BINDING

       The same target/event pair is only registered once.
    ======================================================== */

    listen: function (
      target,
      eventName,
      handler
    ) {
      if (
        !target ||
        !eventName ||
        !handler ||
        this.removed
      ) {
        return false;
      }

      let events =
        this.boundEvents
          .get(target);

      if (!events) {
        events =
          new Set();

        this.boundEvents
          .set(
            target,
            events
          );
      }

      if (
        events.has(
          eventName
        )
      ) {
        return false;
      }

      events.add(
        eventName
      );

      target.addEventListener(
        eventName,
        handler
      );

      this.listeners.push({
        target,
        eventName,
        handler
      });

      return true;
    },


    /* ========================================================
       CONNECT STORY EVENTS
    ======================================================== */

    bindCurrentStory: function () {
      if (this.removed) {
        return;
      }

      const scene =
        this.el.sceneEl;

      const teddy =
        document.querySelector(
          '#teddy'
        );

      const living =
        document.querySelector(
          '#living'
        );

      const mirror =
        document.querySelector(
          '#mirror'
        );

      const incense =
        document.querySelector(
          '#incenseStick'
        );


      /* ------------------------------------------------------
         TEDDY

         natural-grabbable adds state "grabbed".
      ------------------------------------------------------ */

      if (teddy) {
        this.listen(
          teddy,
          'stateadded',
          this.onTeddyStateAdded
        );
      }


      /* ------------------------------------------------------
         TV

         embedded-tv emits tv-state-changed from #living.
      ------------------------------------------------------ */

      if (living) {
        this.listen(
          living,
          'tv-state-changed',
          this.onTVStateChanged
        );
      }


      /* ------------------------------------------------------
         MIRROR

         haunted-mirror emits directly from #mirror.
      ------------------------------------------------------ */

      if (mirror) {
        this.listen(
          mirror,
          'mirror-inspected',
          this.onMirrorInspected
        );
      }


      /* ------------------------------------------------------
         INCENSE LIGHTING

         incense-offering emits directly from #incenseStick.
      ------------------------------------------------------ */

      if (incense) {
        this.listen(
          incense,
          'incense-lit',
          this.onIncenseLit
        );
      }


      /* ------------------------------------------------------
         OFFERING COMPLETION

         incense.js emits offering-completed from the scene.
      ------------------------------------------------------ */

      if (scene) {
        this.listen(
          scene,
          'offering-completed',
          this.onOfferingCompleted
        );
      }


      const missing = [];

      if (!teddy) {
        missing.push(
          '#teddy'
        );
      }

      if (!living) {
        missing.push(
          '#living'
        );
      }

      if (!mirror) {
        missing.push(
          '#mirror'
        );
      }

      if (!incense) {
        missing.push(
          '#incenseStick'
        );
      }

      if (
        missing.length
      ) {
        console.warn(
          'Story manager is waiting for:',
          missing.join(', ')
        );
      }
    },


    /* ========================================================
       TEDDY
    ======================================================== */

    onTeddyStateAdded: function (
      event
    ) {
      if (
        !event ||
        !event.detail ||
        event.detail.state !==
          'grabbed'
      ) {
        return;
      }

      this.collectMilestone(
        'teddy'
      );
    },


    /* ========================================================
       TV
    ======================================================== */

    onTVStateChanged: function (
      event
    ) {
      const isOn =
        Boolean(
          event &&
          event.detail &&
          event.detail.isOn
        );

      if (!isOn) {
        return;
      }

      this.collectMilestone(
        'tv'
      );
    },


    /* ========================================================
       MIRROR
    ======================================================== */

    onMirrorInspected:
      function () {
        this.collectMilestone(
          'mirror'
        );
      },


    /* ========================================================
       INCENSE LIT
    ======================================================== */

    onIncenseLit:
      function () {
        this.collectMilestone(
          'incense-lit'
        );
      },


    /* ========================================================
       OFFERING COMPLETED
    ======================================================== */

    onOfferingCompleted:
      function () {
        this.collectMilestone(
          'offering'
        );
      },


    /* ========================================================
       COLLECT ONE MILESTONE
    ======================================================== */

    collectMilestone: function (
      id
    ) {
      if (
        this.completed ||
        !id ||
        !ROOMS_STORY_MILESTONES
          .includes(id) ||
        this.collected
          .has(id)
      ) {
        return false;
      }

      this.collected.add(
        id
      );

      const detail = {
        id,

        label:
          ROOMS_STORY_LABELS[
            id
          ] ||
          id,

        count:
          this.collected
            .size,

        total:
          ROOMS_STORY_MILESTONES
            .length,

        collected:
          Array.from(
            this.collected
          ),

        remaining:
          ROOMS_STORY_MILESTONES
            .filter(
              (milestone) =>
                !this.collected
                  .has(
                    milestone
                  )
            )
      };

      console.log(
        `Story progress: ${detail.count}/${detail.total} — ${detail.label}`
      );


      /*
        ui-scare.js tutorial logic listens
        to clue-collected on #story-manager.
      */

      this.el.emit(
        'clue-collected',
        detail,
        false
      );


      /*
        Scene-wide event for debug or
        future progress UI.
      */

      this.el.sceneEl.emit(
        'story-progress',
        detail,
        false
      );


      if (
        this.collected.size >=
        ROOMS_STORY_MILESTONES
          .length
      ) {
        this.completeStory();
      }

      return true;
    },


    /* ========================================================
       COMPLETE STORY
    ======================================================== */

    completeStory:
      function () {
        if (
          this.completed
        ) {
          return false;
        }

        const allComplete =
          ROOMS_STORY_MILESTONES
            .every(
              (milestone) =>
                this.collected
                  .has(
                    milestone
                  )
            );

        if (
          !allComplete
        ) {
          return false;
        }

        this.completed =
          true;

        const detail = {
          total:
            ROOMS_STORY_MILESTONES
              .length,

          collected:
            Array.from(
              this.collected
            ),

          completed:
            true
        };

        console.log(
          'All story milestones complete.'
        );


        /*
          IMPORTANT:

          jumpscare-controller inside
          ui-scare.js listens for THIS
          event on #story-manager.
        */

        this.el.emit(
          'all-clues-collected',
          detail,
          false
        );


        this.el.sceneEl.emit(
          'story-completed',
          detail,
          false
        );

        return true;
      },


    /* ========================================================
       DEBUG STATE
    ======================================================== */

    getState:
      function () {
        return {
          milestones:
            ROOMS_STORY_MILESTONES
              .map(
                (id) => ({
                  id,

                  label:
                    ROOMS_STORY_LABELS[
                      id
                    ] ||
                    id,

                  collected:
                    this.collected
                      .has(id)
                })
              ),

          collected:
            Array.from(
              this.collected
            ),

          remaining:
            ROOMS_STORY_MILESTONES
              .filter(
                (id) =>
                  !this.collected
                    .has(id)
              ),

          count:
            this.collected
              .size,

          total:
            ROOMS_STORY_MILESTONES
              .length,

          completed:
            this.completed
        };
      },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {
        this.removed =
          true;

        this.listeners
          .forEach(
            ({
              target,
              eventName,
              handler
            }) => {
              if (
                target
              ) {
                target
                  .removeEventListener(
                    eventName,
                    handler
                  );
              }
            }
          );

        this.listeners =
          [];

        if (
          this.el.sceneEl
        ) {
          this.el.sceneEl
            .removeEventListener(
              'loaded',
              this.onSceneLoaded
            );
        }

        if (
          window
            .getRoomsStoryState
        ) {
          delete window
            .getRoomsStoryState;
        }

        if (
          window
            .printRoomsStoryDebug
        ) {
          delete window
            .printRoomsStoryDebug;
        }
      }
  }
);