/* ============================================================
   story.js
   ROOMS WITHIN

   Current story progression for the demo build.

   The old version expected 5 elements with class="clue".
   The current room does not use those clue objects anymore.

   This version instead tracks 5 interactions that actually exist:

   1. Pick up the teddy.
   2. Turn the TV on.
   3. Inspect the mirror.
   4. Light the incense.
   5. Complete the incense offering.

   It keeps the same event names used by ui-scare.js:
   - clue-collected
   - all-clues-collected
============================================================ */


const ROOMS_STORY_MILESTONES = [
  'teddy',
  'tv',
  'mirror',
  'incense-lit',
  'offering'
];


AFRAME.registerComponent('story-manager', {
  init: function () {
    this.collected = new Set();
    this.completed = false;
    this.listeners = [];

    this.onTeddyStateAdded =
      this.onTeddyStateAdded.bind(this);

    this.onTVStateChanged =
      this.onTVStateChanged.bind(this);

    this.onMirrorInspected =
      this.onMirrorInspected.bind(this);

    this.onIncenseLit =
      this.onIncenseLit.bind(this);

    this.onOfferingCompleted =
      this.onOfferingCompleted.bind(this);


    this.bindCurrentStory();

    /*
      Small debug helper.

      You can type:
      getRoomsStoryState()

      in the browser console to see story progress.
    */
    window.getRoomsStoryState =
      () => ({
        collected:
          Array.from(this.collected),

        count:
          this.collected.size,

        total:
          ROOMS_STORY_MILESTONES.length,

        completed:
          this.completed
      });

    console.log(
      'Story manager ready.',
      `Waiting for ${ROOMS_STORY_MILESTONES.length} interaction milestone(s).`
    );
  },


  /* ==========================================================
     SAFE LISTENER REGISTRATION
  ========================================================== */

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


  /* ==========================================================
     BIND CURRENT ROOM INTERACTIONS
  ========================================================== */

  bindCurrentStory: function () {
    const teddy =
      document.querySelector(
        '#teddy'
      );

    const living =
      document.querySelector(
        '#living'
      );

    const incense =
      document.querySelector(
        '#incenseStick'
      );

    const scene =
      this.el.sceneEl;


    if (teddy) {
      this.listen(
        teddy,
        'stateadded',
        this.onTeddyStateAdded
      );
    } else {
      console.warn(
        'Story manager: #teddy was not found.'
      );
    }


    if (living) {
      this.listen(
        living,
        'tv-state-changed',
        this.onTVStateChanged
      );
    } else {
      console.warn(
        'Story manager: #living was not found, so TV progression cannot be tracked.'
      );
    }


    if (scene) {
      this.listen(
        scene,
        'mirror-inspected',
        this.onMirrorInspected
      );

      this.listen(
        scene,
        'offering-completed',
        this.onOfferingCompleted
      );
    }


    if (incense) {
      this.listen(
        incense,
        'incense-lit',
        this.onIncenseLit
      );
    } else {
      console.warn(
        'Story manager: #incenseStick was not found.'
      );
    }
  },


  /* ==========================================================
     MILESTONE HANDLERS
  ========================================================== */

  onTeddyStateAdded: function (
    event
  ) {
    if (
      !event.detail ||
      event.detail.state !==
        'grabbed'
    ) {
      return;
    }

    this.collectMilestone(
      'teddy',
      'Teddy picked up'
    );
  },


  onTVStateChanged: function (
    event
  ) {
    if (
      !event.detail ||
      !event.detail.isOn
    ) {
      return;
    }

    this.collectMilestone(
      'tv',
      'TV turned on'
    );
  },


  onMirrorInspected: function () {
    this.collectMilestone(
      'mirror',
      'Mirror inspected'
    );
  },


  onIncenseLit: function () {
    this.collectMilestone(
      'incense-lit',
      'Incense lit'
    );
  },


  onOfferingCompleted:
    function () {
      this.collectMilestone(
        'offering',
        'Offering completed'
      );
    },


  /* ==========================================================
     REGISTER PROGRESS

     clue-collected is kept because ui-scare.js already listens
     for that event to dismiss tutorial UI.
  ========================================================== */

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
      total
    };


    console.log(
      `Story progress: ${detail.label} (${count}/${total})`
    );


    /*
      Existing UI compatibility.
    */
    this.el.emit(
      'clue-collected',
      detail,
      false
    );


    /*
      Extra clean scene-level event for future systems.
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


  /* ==========================================================
     STORY COMPLETE
  ========================================================== */

  completeStory: function () {
    if (this.completed) {
      return;
    }


    this.completed = true;


    const detail = {
      total:
        ROOMS_STORY_MILESTONES.length,

      collected:
        Array.from(
          this.collected
        )
    };


    console.log(
      'All current story interactions completed.'
    );


    /*
      Keep this exact event name because jumpscare-controller
      in ui-scare.js listens for it.
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


  /* ==========================================================
     CLEANUP
  ========================================================== */

  remove: function () {
    this.listeners.forEach(
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


    this.listeners = [];


    if (
      window.getRoomsStoryState
    ) {
      delete window
        .getRoomsStoryState;
    }
  }
});