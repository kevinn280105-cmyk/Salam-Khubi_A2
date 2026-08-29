/* ============================================================
   story.js — ROOMS WITHIN
   FULL REPLACEMENT — 3 ITEM QUEST STORY

   The story now follows the new FIND 3 ITEMS objective:

   1. Inspect the Teddy Bear.
   2. Inspect the Hair Clipper.
   3. Inspect the Picture.

   interaction-prompts.js emits:
   - quest-item-found
   - quest-items-complete

   This story manager converts those events into the existing
   story events already used elsewhere in the project:

   - clue-collected
   - all-clues-collected
   - story-progress
   - story-completed

   That means ui-scare.js / jumpscare-controller can continue
   listening for all-clues-collected without needing another rewrite.
============================================================ */


/* ============================================================
   STORY MILESTONES
============================================================ */

const ROOMS_STORY_MILESTONES = [
  'teddy',
  'hair-clipper',
  'picture'
];


const ROOMS_STORY_LABELS = {
  'teddy': 'Teddy Bear inspected',
  'hair-clipper': 'Hair Clipper inspected',
  'picture': 'Picture inspected'
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

      this.listeners =
        [];


      this.onQuestItemFound =
        this.onQuestItemFound
          .bind(this);


      this.onQuestItemsComplete =
        this.onQuestItemsComplete
          .bind(this);


      this.bindCurrentStory();


      /* ======================================================
         DEBUG

         Browser console:

         getRoomsStoryState()
      ====================================================== */

      window.getRoomsStoryState =
        () => ({
          collected:
            Array.from(
              this.collected
            ),

          count:
            this.collected.size,

          total:
            ROOMS_STORY_MILESTONES.length,

          completed:
            this.completed
        });


      console.log(
        'Story manager ready.',
        'Waiting for 3 inspected quest items.'
      );
    },


    /* ========================================================
       SAFE LISTENER REGISTRATION
    ======================================================== */

    listen: function (
      target,
      eventName,
      handler
    ) {
      if (
        !target ||
        !eventName ||
        !handler
      ) {
        return;
      }


      target.addEventListener(
        eventName,
        handler
      );


      this.listeners.push({
        target,
        eventName,
        handler
      });
    },


    /* ========================================================
       BIND NEW QUEST SYSTEM
    ======================================================== */

    bindCurrentStory: function () {
      const scene =
        this.el.sceneEl;


      if (!scene) {
        console.warn(
          'Story manager: scene was not found.'
        );

        return;
      }


      /*
        interaction-prompts.js emits these on the scene.
      */
      this.listen(
        scene,
        'quest-item-found',
        this.onQuestItemFound
      );


      this.listen(
        scene,
        'quest-items-complete',
        this.onQuestItemsComplete
      );
    },


    /* ========================================================
       QUEST ITEM FOUND
    ======================================================== */

    onQuestItemFound: function (
      event
    ) {
      const detail =
        event &&
        event.detail
          ? event.detail
          : {};


      const key =
        String(
          detail.key || ''
        );


      if (
        !ROOMS_STORY_MILESTONES
          .includes(key)
      ) {
        console.warn(
          `Story manager ignored unknown quest item: ${key}`
        );

        return;
      }


      this.collectMilestone(
        key,
        ROOMS_STORY_LABELS[key] ||
        detail.title ||
        key
      );
    },


    /* ========================================================
       QUEST COMPLETE FALLBACK

       Normally the third quest-item-found already completes the
       story. This listener is an extra safety net in case the UI
       emits quest-items-complete directly.
    ======================================================== */

    onQuestItemsComplete:
      function () {
        if (
          this.completed
        ) {
          return;
        }


        /*
          If all 3 item-found events were received,
          complete normally.
        */
        if (
          this.collected.size >=
          ROOMS_STORY_MILESTONES.length
        ) {
          this.completeStory();

          return;
        }


        /*
          If quest-items-complete arrives before one of the
          individual events for any reason, synchronize the story
          to the completed quest state instead of getting stuck.
        */
        ROOMS_STORY_MILESTONES
          .forEach(
            (id) => {
              if (
                !this.collected
                  .has(id)
              ) {
                this.collectMilestone(
                  id,
                  ROOMS_STORY_LABELS[id]
                );
              }
            }
          );
      },


    /* ========================================================
       REGISTER STORY PROGRESS
    ======================================================== */

    collectMilestone: function (
      id,
      label
    ) {
      if (
        this.completed ||
        !id ||
        this.collected.has(id)
      ) {
        return false;
      }


      if (
        !ROOMS_STORY_MILESTONES
          .includes(id)
      ) {
        console.warn(
          `Story manager ignored unknown milestone: ${id}`
        );

        return false;
      }


      this.collected.add(id);


      const count =
        this.collected.size;


      const total =
        ROOMS_STORY_MILESTONES.length;


      const detail = {
        id,

        label:
          label || id,

        count,

        total,

        collected:
          Array.from(
            this.collected
          )
      };


      console.log(
        `Story progress: ${detail.label} (${count}/${total})`
      );


      /*
        Keep compatibility with tutorial/UI systems
        that already listen for clue-collected.
      */
      this.el.emit(
        'clue-collected',
        detail,
        false
      );


      /*
        Scene-level progress event for other systems.
      */
      this.el.sceneEl.emit(
        'story-progress',
        detail,
        false
      );


      if (
        count >= total &&
        !this.completed
      ) {
        this.completeStory();
      }


      return true;
    },


    /* ========================================================
       STORY COMPLETE
    ======================================================== */

    completeStory: function () {
      if (
        this.completed
      ) {
        return;
      }


      this.completed =
        true;


      const detail = {
        total:
          ROOMS_STORY_MILESTONES.length,

        collected:
          Array.from(
            this.collected
          )
      };


      console.log(
        'All 3 quest items inspected. Story objective complete.'
      );


      /*
        IMPORTANT:
        ui-scare.js jumpscare-controller already listens for this
        exact event on #story-manager.
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
    },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove: function () {
      this.listeners
        .forEach(
          ({
            target,
            eventName,
            handler
          }) => {
            target.removeEventListener(
              eventName,
              handler
            );
          }
        );


      this.listeners =
        [];


      if (
        window.getRoomsStoryState
      ) {
        delete window
          .getRoomsStoryState;
      }
    }
  }
);