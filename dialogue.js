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
  gapMs: 260,
  basePanelWidth: 1.05,
  basePanelHeight: 0.20,
  panelVerticalPadding: 0.06,
  panelPixelsPerUnit: 666.67,

  /*
    Desktop (magic window) and an actual VR headset use a different
    effective field of view, so the same camera-local position does
    NOT land in the same spot on screen in both -- being a child of
    #cam only keeps it moving with your head, it does not fix this.
    Same problem the quest tracker HUD solves in interaction-
    prompts.js (questPositionDesktop/questPositionVR) -- mirror that
    pattern here instead of assuming "attached to the camera" was
    enough, which is what let this go untested in a real headset.
  */
  positionDesktop: '0 -0.36 -1.05',
  positionVR: '0 -0.43 -0.62',
  scaleDesktop: '1 1 1',
  scaleVR: '1.2 1.2 1.2'
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
      this.updatePlacement = this.updatePlacement.bind(this);
      this.onEnterVR = this.onEnterVR.bind(this);

      roomsDialogueSubtitleInstance = this;

      this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
      this.el.sceneEl.addEventListener('exit-vr', this.updatePlacement);

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

      /*
        BUG FIX: roomsDialogueSubtitleInstance is set in init(),
        which runs almost immediately -- well before the scene has
        actually loaded (real GLB assets can take way longer than
        the short delay ui-scare.js waits before queuing the intro
        lines). Any roomsQueueDialogueLine() call in that window
        goes straight into this.queue via queueLine(), but pump()
        silently no-ops while this.root doesn't exist yet -- so the
        line was getting stuck in this.queue forever, with nothing
        ever draining it once the UI was finally built. This is
        what caused the intro lines (and potentially any other line
        queued very early) to never appear. Draining the outer
        roomsPendingDialogueLines above does not cover this case --
        it only helps for calls made before init() itself has run.
      */
      this.pump();
    },

    buildUI: function () {
      if (this.root) {
        return;
      }

      const root = roomsCreateEntity('a-entity', {
        position: ROOMS_DIALOGUE_CONFIG.positionDesktop,
        scale: ROOMS_DIALOGUE_CONFIG.scaleDesktop,
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
      this.currentPanelHeight = ROOMS_DIALOGUE_CONFIG.basePanelHeight;

      this.updatePlacement();
    },

    /*
      A single updatePlacement() call exactly when 'enter-vr' fires
      was not reliable in practice -- the very first time entering a
      real headset session, the text could stay invisible until the
      player exited and re-entered VR (by which point a second
      enter-vr already happened to line up correctly). Retrying at
      several delays is the same fix interaction-prompts.js already
      uses for the quest tracker's own onEnterVR, for what is likely
      the same underlying flakiness (matrices / renderer.xr state not
      fully settled the instant the event fires).
    */
    onEnterVR: function () {
      [0, 50, 250, 600].forEach((delay) => {
        window.setTimeout(() => {
          this.updatePlacement();
        }, delay);
      });
    },

    /*
      Swap position/scale whenever the XR presenting state changes,
      same trigger interaction-prompts.js uses for the quest tracker.
    */
    updatePlacement: function () {
      if (!this.root) {
        return;
      }

      const immersive = roomsPromptsImmersiveXR(this.el.sceneEl);

      const position = immersive
        ? ROOMS_DIALOGUE_CONFIG.positionVR
        : ROOMS_DIALOGUE_CONFIG.positionDesktop;

      const scale = immersive
        ? ROOMS_DIALOGUE_CONFIG.scaleVR
        : ROOMS_DIALOGUE_CONFIG.scaleDesktop;

      this.root.setAttribute('position', position);
      this.root.setAttribute('scale', scale);
    },

    queueLine: function (text, opts) {
      if (!text) {
        return;
      }

      opts = opts || {};

      if (opts.priority) {
        /*
          Priority lines (e.g. a scare reaction that must play the
          instant it happens) cut to the front of the queue instead
          of waiting behind whatever narrative lines already piled
          up. If something is on screen right now, interrupt it so
          the priority line can show immediately rather than only
          appearing once the backlog drains -- which could be well
          after the moment it was reacting to has already passed.
        */
        this.queue.unshift({ text, opts });

        if (this.showing) {
          if (this.hideTimer) {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = null;
          }

          if (this.advanceTimer) {
            window.clearTimeout(this.advanceTimer);
            this.advanceTimer = null;
          }

          roomsSetVisible(this.root, false);
          this.showing = false;
        }
      } else {
        this.queue.push({ text, opts });
      }

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

      /*
        Defensive re-sync: re-check desktop-vs-VR placement every time a
        line is about to show, not just on the enter-vr/exit-vr events.
        If the XR session state ever changes without that event firing
        cleanly (or fires before this component exists yet), this still
        catches it before the next line goes up instead of leaving the
        panel stuck in the wrong spot for the rest of the game.
      */
      this.updatePlacement();

      this.text.setAttribute('value', text);

      /*
        The text component needs a frame (sometimes two) to actually lay
        out the new value before its rendered bounding box is accurate --
        measuring immediately after setAttribute can still report the
        PREVIOUS line's size. Resize the panel to fit, THEN reveal it, so
        the player never sees a wrong-sized panel snap to the right size.
      */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.resizePanelToFit();
          roomsSetVisible(this.root, true);
        });
      });

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
      Grows the panel downward (away from screen-center) to fit however
      many lines the current text wrapped to, instead of a fixed size
      that overflows on long lines or wastes space on short ones. The
      TOP edge stays anchored in place as it grows, so a long line never
      creeps upward into the quest tracker HUD sitting just above it.
    */
    resizePanelToFit: function () {
      const textObj = this.text.getObject3D('text');

      if (!textObj) {
        return;
      }

      const box = new THREE.Box3().setFromObject(textObj);
      const size = new THREE.Vector3();
      box.getSize(size);

      /*
        box.getSize() measures in WORLD units, which already include
        this entity's own scale (1.2x in VR -- see ROOMS_DIALOGUE_CONFIG
        scaleVR). The background's own "height" attribute is in this
        entity's LOCAL space, so divide back out by that scale before
        comparing/assigning, or the panel would over-grow by 1.2x
        whenever a long line is shown in VR.
      */
      const rootScale =
        (this.root.object3D && this.root.object3D.scale.y) || 1;

      const needed =
        size.y / rootScale + ROOMS_DIALOGUE_CONFIG.panelVerticalPadding;

      const newHeight = Math.max(
        ROOMS_DIALOGUE_CONFIG.basePanelHeight,
        needed
      );

      if (Math.abs(newHeight - this.currentPanelHeight) < 0.002) {
        return;
      }

      this.currentPanelHeight = newHeight;

      const growth =
        newHeight - ROOMS_DIALOGUE_CONFIG.basePanelHeight;

      const yOffset = -(growth / 2);

      this.background.setAttribute('height', String(newHeight));
      this.background.setAttribute('position', `0 ${yOffset} 0.001`);
      this.text.setAttribute('position', `0 ${yOffset} 0.002`);

      const canvasHeight = Math.round(
        newHeight * ROOMS_DIALOGUE_CONFIG.panelPixelsPerUnit
      );

      roomsApplyCanvasTexture(
        this.background,
        roomsCreateRoundedPanelTexture({
          width: 700,
          height: canvasHeight,
          radius: 22,
          fillColor: '#0b0b0e',
          fillOpacity: 0.84,
          strokeColor: '#caa46a',
          strokeOpacity: 0.5,
          strokeWidth: 3
        })
      );
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

      this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
      this.el.sceneEl.removeEventListener('exit-vr', this.updatePlacement);

      if (roomsDialogueSubtitleInstance === this) {
        roomsDialogueSubtitleInstance = null;
      }
    }
  }
);
