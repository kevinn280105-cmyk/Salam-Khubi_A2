/* ============================================================
   DIALOGUE / SUBTITLE SYSTEM

   A single camera-attached subtitle line, shown one at a time
   from a queue, that fades in, holds for a duration scaled to
   how much text it has (so long speeches stay up long enough to
   read), then fades out before the next line shows. Works the
   same on desktop and in a real headset because it is a child
   of #cam, same pattern as the quest tracker HUD in
   interaction-prompts.js and the vrPausePanel in index.html.

   Other files trigger lines with:
     roomsQueueDialogueLine('Some line of text.');

   That helper is safe to call even before this component has
   built its UI (very early scene boot) -- lines queued before
   it is ready are held in roomsPendingDialogueLines and flushed
   once it is.

   Trigger sites (see each file for the exact hook):
     ui-scare.js        - intro lines when the game starts
     interaction-prompts.js - altar discovered / items placed
     monster.js          - altar ghost first appears
     engine-interactions.js - TV turned on, door locked, sit-with-ghost
     safe.js              - safe locked-before-code, safe opened
     story.js              - true ending lock, after the sit-with-
                             ghost lines have had time to play
============================================================ */

const ROOMS_DIALOGUE_CONFIG = {
  fadeMs: 220,
  minHoldMs: 2400,
  maxHoldMs: 9000,
  msPerWord: 340,
  baseMs: 900,
  gapMs: 260
};


function roomsDialogueHoldMs(text) {
  const words =
    String(text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  const raw =
    words * ROOMS_DIALOGUE_CONFIG.msPerWord +
    ROOMS_DIALOGUE_CONFIG.baseMs;

  return Math.max(
    ROOMS_DIALOGUE_CONFIG.minHoldMs,
    Math.min(ROOMS_DIALOGUE_CONFIG.maxHoldMs, raw)
  );
}


let roomsDialogueSubtitleInstance = null;
let roomsPendingDialogueLines = [];


function roomsQueueDialogueLine(text, opts) {
  const line = String(text || '').trim();

  if (!line) {
    return false;
  }

  if (!roomsDialogueSubtitleInstance) {
    roomsPendingDialogueLines.push({ text: line, opts: opts || {} });
    return true;
  }

  roomsDialogueSubtitleInstance.queueLine(line, opts || {});
  return true;
}


window.roomsQueueDialogueLine = roomsQueueDialogueLine;


/* ============================================================
   SACRIFICE PROGRESS ANNOUNCEMENTS

   Shared by interaction-prompts.js (altar discovered, right
   after the incense is lit) and (each item placed on
   #truocbantho). Builds both the spoken line and the
   "Quest Updated" toast from ROOMS_QUEST_ITEMS / roomsPromptState
   so the item list never has to be duplicated or hand-kept in
   sync elsewhere.
============================================================ */

const ROOMS_SACRIFICE_FLAVOR_NAMES = {
  teddy: 'the teddy bear',
  'hair-clipper': 'the hair clipper',
  picture: 'an old drawn picture'
};


function roomsAnnounceSacrificeProgress(found, total) {
  const remaining = Math.max(0, total - found);

  if (remaining <= 0) {
    roomsQueueDialogueLine("That's all of them.");
    roomsQueueDialogueLine('Quest Updated: Talk to the ghost');
    return;
  }

  const remainingNames = ROOMS_QUEST_ITEMS
    .filter((item) => !roomsPromptState.foundItems.has(item.key))
    .map((item) => ROOMS_SACRIFICE_FLAVOR_NAMES[item.key] || item.title.toLowerCase())
    .join(', ');

  const sacrificeWord = remaining === 1 ? 'sacrifice' : 'sacrifices';

  let line;

  if (found === 0) {
    line = 'Seems like it sacrifices are required, about 3 of them.';
  } else if (remaining === 1) {
    line = 'Only one left.';
  } else {
    line = 'First one down, two more to go.';
  }

  roomsQueueDialogueLine(line);

  roomsQueueDialogueLine(
    `Quest Updated: find ${remaining} ${sacrificeWord} - ${remainingNames}`
  );
}


window.roomsAnnounceSacrificeProgress = roomsAnnounceSacrificeProgress;


AFRAME.registerComponent(
  'rooms-dialogue-subtitles',
  {
    init: function () {
      this.queue = [];
      this.showing = false;
      this.camera = null;
      this.root = null;
      this.background = null;
      this.text = null;
      this.hideTimer = null;
      this.advanceTimer = null;

      this.tryBuild = this.tryBuild.bind(this);

      roomsDialogueSubtitleInstance = this;

      if (this.el.sceneEl.hasLoaded) {
        this.tryBuild();
      } else {
        this.el.sceneEl.addEventListener(
          'loaded',
          this.tryBuild,
          { once: true }
        );
      }
    },

    tryBuild: function () {
      this.camera =
        document.querySelector('#cam') ||
        document.querySelector('[camera]');

      if (!this.camera) {
        window.setTimeout(this.tryBuild, 200);
        return;
      }

      this.buildUI();

      if (roomsPendingDialogueLines.length) {
        const pending = roomsPendingDialogueLines;
        roomsPendingDialogueLines = [];

        pending.forEach((item) => {
          this.queueLine(item.text, item.opts);
        });
      }
    },

    buildUI: function () {
      if (this.root) {
        return;
      }

      const root = roomsCreateEntity('a-entity', {
        position: '0 -0.34 -1.05',
        visible: false
      });

      const background = roomsCreateEntity('a-plane', {
        width: '1.05',
        height: '0.20',
        material:
          'shader: flat; transparent: true; side: double; depthTest: false; depthWrite: false'
      });

      root.appendChild(background);

      roomsApplyCanvasTexture(
        background,
        roomsCreateRoundedPanelTexture({
          width: 700,
          height: 132,
          radius: 22,
          fillColor: '#0b0b0e',
          fillOpacity: 0.84,
          strokeColor: '#caa46a',
          strokeOpacity: 0.5,
          strokeWidth: 3
        })
      );

      const text = roomsCreateText(
        '',
        '0 0 0.002',
        '0.95',
        'center',
        '#f2ead9',
        44
      );

      root.appendChild(text);

      this.camera.appendChild(root);

      this.root = root;
      this.background = background;
      this.text = text;
    },

    queueLine: function (text, opts) {
      if (!text) {
        return;
      }

      this.queue.push({ text, opts: opts || {} });
      this.pump();
    },

    pump: function () {
      if (this.showing || !this.root || this.queue.length === 0) {
        return;
      }

      const next = this.queue.shift();

      this.showLine(next.text, next.opts);
    },

    showLine: function (text, opts) {
      this.showing = true;

      this.text.setAttribute('value', text);

      roomsSetVisible(this.root, true);

      const holdMs =
        opts && opts.holdMs
          ? opts.holdMs
          : roomsDialogueHoldMs(text);

      if (this.hideTimer) {
        window.clearTimeout(this.hideTimer);
      }

      if (this.advanceTimer) {
        window.clearTimeout(this.advanceTimer);
      }

      this.hideTimer = window.setTimeout(() => {
        roomsSetVisible(this.root, false);

        this.advanceTimer = window.setTimeout(() => {
          this.showing = false;
          this.pump();
        }, ROOMS_DIALOGUE_CONFIG.gapMs);

      }, holdMs);
    },

    /*
      Used by story.js to know when it is safe to show the end
      screen after queuing the closing lines -- returns how many
      milliseconds from now until every currently-queued line
      (plus whatever is on screen right now) has finished.
    */
    estimateRemainingMs: function () {
      let total = 0;

      if (this.showing && this.text) {
        total += ROOMS_DIALOGUE_CONFIG.maxHoldMs;
      }

      total +=
        this.queue.length *
        (ROOMS_DIALOGUE_CONFIG.maxHoldMs +
          ROOMS_DIALOGUE_CONFIG.gapMs);

      return total;
    },

    remove: function () {
      if (this.hideTimer) {
        window.clearTimeout(this.hideTimer);
      }

      if (this.advanceTimer) {
        window.clearTimeout(this.advanceTimer);
      }

      if (roomsDialogueSubtitleInstance === this) {
        roomsDialogueSubtitleInstance = null;
      }
    }
  }
);
