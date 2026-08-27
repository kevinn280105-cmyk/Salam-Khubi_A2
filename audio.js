/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — QUEST AUDIO FIX

   Fixes the "STARTING SOUND..." hang.

   Main changes:
   - Uses A-Frame / THREE Web Audio for VR sound.
   - ENABLE SOUND no longer waits forever on HTML <audio>.play().
   - Generic page pointerdown no longer starts a competing unlock
     before the ENABLE SOUND click.
   - AudioContext resume has a timeout.
   - Quest controller input can retry audio unlock.
   - ENTER VR can retry audio unlock.
   - TV static follows the standalone #tv position.
   - Thunder is kept for engine-environment.js.
============================================================ */


/* ============================================================
   GLOBAL AUDIO STATE
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;
let roomsAudioUnlockPromise = null;
let roomsLastUnlockSource = 'none';
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;


/* ============================================================
   SOUND DEFINITIONS
============================================================ */

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1.0),
    volume: 0.24,
    loop: true,
    startAutomatically: true,
    positional: true,
    refDistance: 1.5,
    maxDistance: 12,
    rolloffFactor: 1.25
  },

  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2.0, 1.6, -3.0),
    volume: 0.20,
    loop: true,
    startAutomatically: true,
    positional: true,
    refDistance: 1.4,
    maxDistance: 11,
    rolloffFactor: 1.25
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    volume: 0.14,
    loop: true,
    startAutomatically: true,
    positional: true,
    refDistance: 1.2,
    maxDistance: 9,
    rolloffFactor: 1.4
  },

  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1.2, 0),
    volume: 0.18,
    loop: true,
    startAutomatically: false,
    positional: true,
    refDistance: 0.8,
    maxDistance: 7,
    rolloffFactor: 1.6
  },

  {
    id: 'thunderSound',
    src: 'sounds/thunder.wav',
    position: new THREE.Vector3(0, 0, 0),
    volume: 0.55,
    loop: false,
    startAutomatically: false,
    positional: false,
    refDistance: 1,
    maxDistance: 100,
    rolloffFactor: 1
  }
];


/* ============================================================
   GENERAL HELPERS
============================================================ */

function clamp01(value) {
  return Math.max(
    0,
    Math.min(1, Number(value) || 0)
  );
}


function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}


async function promiseWithTimeout(
  promise,
  milliseconds,
  fallbackValue
) {
  return Promise.race([
    Promise.resolve(promise),
    delay(milliseconds).then(() => fallbackValue)
  ]);
}


function getScene() {
  return document.querySelector('a-scene');
}


function getRoomSoundDefinition(id) {
  return (
    ROOM_SOUND_DEFINITIONS.find(
      (definition) => definition.id === id
    ) || null
  );
}


function hasRoomsImmersiveXRSession(scene) {
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
  } catch (error) {
    return false;
  }
}


function isRoomsPauseMenuOpen() {
  if (
    window.roomsPaused ||
    window.roomsInputLocked
  ) {
    return true;
  }

  const desktopOverlay =
    document.querySelector('#screenPauseMenuOverlay');

  if (
    desktopOverlay &&
    desktopOverlay.classList.contains('is-open')
  ) {
    return true;
  }

  const vrPanel =
    document.querySelector('#vrPausePanel');

  if (vrPanel) {
    const visible =
      vrPanel.getAttribute('visible');

    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }

  return false;
}


function getFinalVolume(definition) {
  if (!definition || roomsMuted) {
    return 0;
  }

  return clamp01(
    definition.volume *
      roomsMasterVolume
  );
}


function getPlayerFootstepVolume() {
  if (roomsMuted) {
    return 0;
  }

  return clamp01(
    0.11 * roomsMasterVolume
  );
}


function getScareFootstepVolume() {
  if (roomsMuted) {
    return 0;
  }

  return clamp01(
    0.30 * roomsMasterVolume
  );
}


/* ============================================================
   WEB AUDIO CONTEXT
============================================================ */

function getRoomsAudioContext() {
  try {
    if (
      typeof THREE !== 'undefined' &&
      THREE.AudioContext &&
      THREE.AudioContext.getContext
    ) {
      const context =
        THREE.AudioContext.getContext();

      if (context) {
        return context;
      }
    }
  } catch (error) {
    /* Continue to scene fallback. */
  }

  const scene = getScene();

  if (
    scene &&
    scene.audioListener &&
    scene.audioListener.context
  ) {
    return scene.audioListener.context;
  }

  return null;
}


async function resumeRoomsAudioContext() {
  const context =
    getRoomsAudioContext();

  if (!context) {
    console.warn(
      'Rooms Within audio: Web Audio context was not available yet.'
    );

    return false;
  }

  if (context.state === 'running') {
    return true;
  }

  try {
    await promiseWithTimeout(
      context.resume(),
      1200,
      null
    );
  } catch (error) {
    console.warn(
      'Could not resume Web Audio context:',
      error
    );
  }

  /*
    Some mobile browsers wake the context only after a tiny source
    has been started during the same user gesture.
  */

  if (context.state !== 'running') {
    try {
      const buffer =
        context.createBuffer(
          1,
          1,
          context.sampleRate || 44100
        );

      const source =
        context.createBufferSource();

      const gain =
        context.createGain();

      gain.gain.value = 0;

      source.buffer = buffer;

      source.connect(gain);

      gain.connect(
        context.destination
      );

      source.start(0);

      source.stop(0.01);

    } catch (error) {
      /*
        Best-effort mobile audio wake-up.
      */
    }
  }

  return (
    context.state ===
    'running'
  );
}


/* ============================================================
   A-FRAME SOUND MANAGER
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init: function () {
      this.emitters =
        new Map();

      this.desiredPlaying =
        new Set();

      this.playingIds =
        new Set();

      this.created =
        false;

      this.controllerTargets =
        [];

      this.controllerEvents = [
        'triggerdown',
        'gripdown',
        'squeezestart',
        'abuttondown',
        'bbuttondown',
        'xbuttondown',
        'ybuttondown'
      ];

      this.createEmitters =
        this.createEmitters.bind(
          this
        );

      this.onPauseChanged =
        this.onPauseChanged.bind(
          this
        );

      this.onEnterVR =
        this.onEnterVR.bind(
          this
        );

      this.onControllerGesture =
        this.onControllerGesture.bind(
          this
        );

      this.attachControllerRecovery =
        this.attachControllerRecovery.bind(
          this
        );

      this.el.addEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );

      this.el.addEventListener(
        'enter-vr',
        this.onEnterVR
      );

      if (this.el.hasLoaded) {
        this.createEmitters();

        this.attachControllerRecovery();
      } else {
        this.el.addEventListener(
          'loaded',
          () => {
            this.createEmitters();

            this.attachControllerRecovery();
          },
          {
            once: true
          }
        );
      }

      window.setTimeout(
        this.attachControllerRecovery,
        500
      );

      window.setTimeout(
        this.attachControllerRecovery,
        1500
      );
    },


    /* ========================================================
       CREATE AUDIO EMITTERS
    ======================================================== */

    createEmitters:
      function () {
        if (this.created) {
          return;
        }

        this.created =
          true;

        ROOM_SOUND_DEFINITIONS.forEach(
          (definition) => {
            const emitter =
              document.createElement(
                'a-entity'
              );

            emitter.setAttribute(
              'id',
              definition.id
            );

            emitter.classList.add(
              'spatial-sound'
            );

            emitter.setAttribute(
              'position',
              {
                x:
                  definition.position.x,

                y:
                  definition.position.y,

                z:
                  definition.position.z
              }
            );

            emitter.setAttribute(
              'sound',
              {
                src:
                  `url(${definition.src})`,

                autoplay:
                  false,

                loop:
                  Boolean(
                    definition.loop
                  ),

                positional:
                  Boolean(
                    definition.positional
                  ),

                volume:
                  getFinalVolume(
                    definition
                  ),

                distanceModel:
                  'inverse',

                refDistance:
                  definition.refDistance,

                maxDistance:
                  definition.maxDistance,

                rolloffFactor:
                  definition.rolloffFactor,

                poolSize:
                  definition.id ===
                  'thunderSound'
                    ? 2
                    : 1
              }
            );

            emitter.addEventListener(
              'sound-loaded',
              () => {
                console.log(
                  `A-Frame sound ready: ${definition.id}`
                );

                if (
                  this.desiredPlaying.has(
                    definition.id
                  ) &&
                  roomsAudioUnlocked &&
                  !roomsMuted &&
                  !isRoomsPauseMenuOpen()
                ) {
                  this.playEmitter(
                    definition.id
                  );
                }
              }
            );

            this.el.appendChild(
              emitter
            );

            this.emitters.set(
              definition.id,
              emitter
            );

            if (
              definition.startAutomatically
            ) {
              this.desiredPlaying.add(
                definition.id
              );
            }
          }
        );

        if (
          roomsTVWorldPosition
        ) {
          this.setEmitterPosition(
            'tvStaticSound',
            roomsTVWorldPosition
          );
        }

        this.updateVolumes();
      },


    /* ========================================================
       GET EMITTER
    ======================================================== */

    getEmitter:
      function (
        id
      ) {
        return (
          this.emitters.get(
            id
          ) ||
          null
        );
      },


    /* ========================================================
       GET A-FRAME SOUND COMPONENT
    ======================================================== */

    getSound:
      function (
        id
      ) {
        const emitter =
          this.getEmitter(
            id
          );

        if (
          !emitter ||
          !emitter.components
        ) {
          return null;
        }

        return (
          emitter.components.sound ||
          null
        );
      },


    /* ========================================================
       UPDATE VOLUMES
    ======================================================== */

    updateVolumes:
      function () {
        ROOM_SOUND_DEFINITIONS.forEach(
          (definition) => {
            const emitter =
              this.getEmitter(
                definition.id
              );

            if (!emitter) {
              return;
            }

            emitter.setAttribute(
              'sound',
              'volume',
              getFinalVolume(
                definition
              )
            );
          }
        );
      },


    /* ========================================================
       PLAY LOOPING SOUND
    ======================================================== */

    playEmitter:
      function (
        id
      ) {
        this.desiredPlaying.add(
          id
        );

        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          return false;
        }

        if (
          this.playingIds.has(
            id
          )
        ) {
          return true;
        }

        const sound =
          this.getSound(
            id
          );

        if (
          !sound ||
          !sound.playSound
        ) {
          return false;
        }

        try {
          sound.playSound();

          this.playingIds.add(
            id
          );

          return true;

        } catch (error) {
          console.warn(
            `Could not play ${id}:`,
            error
          );

          return false;
        }
      },


    /* ========================================================
       STOP SOUND
    ======================================================== */

    stopEmitter:
      function (
        id
      ) {
        this.desiredPlaying.delete(
          id
        );

        this.playingIds.delete(
          id
        );

        const sound =
          this.getSound(
            id
          );

        if (!sound) {
          return;
        }

        try {
          if (
            sound.stopSound
          ) {
            sound.stopSound();
          } else if (
            sound.pauseSound
          ) {
            sound.pauseSound();
          }

        } catch (error) {
          console.warn(
            `Could not stop ${id}:`,
            error
          );
        }
      },


    /* ========================================================
       PAUSE WITHOUT FORGETTING IT SHOULD PLAY
    ======================================================== */

    pauseEmitterWithoutChangingIntent:
      function (
        id
      ) {
        this.playingIds.delete(
          id
        );

        const sound =
          this.getSound(
            id
          );

        if (!sound) {
          return;
        }

        try {
          if (
            sound.pauseSound
          ) {
            sound.pauseSound();

          } else if (
            sound.stopSound
          ) {
            sound.stopSound();
          }

        } catch (error) {
          console.warn(
            `Could not pause ${id}:`,
            error
          );
        }
      },


    /* ========================================================
       PAUSE ALL SOUND
    ======================================================== */

    pauseAllWithoutChangingIntent:
      function () {
        this.emitters.forEach(
          (
            emitter,
            id
          ) => {
            this.pauseEmitterWithoutChangingIntent(
              id
            );
          }
        );
      },


    /* ========================================================
       START NORMAL AMBIENCE
    ======================================================== */

    playNormalAmbience:
      function () {
        ROOM_SOUND_DEFINITIONS.forEach(
          (definition) => {
            if (
              definition.startAutomatically
            ) {
              this.desiredPlaying.add(
                definition.id
              );
            }
          }
        );

        this.applyPlaybackState();
      },


    /* ========================================================
       MOVE POSITIONAL SOUND
    ======================================================== */

    setEmitterPosition:
      function (
        id,
        worldPosition
      ) {
        const definition =
          getRoomSoundDefinition(
            id
          );

        const emitter =
          this.getEmitter(
            id
          );

        if (
          !definition ||
          !emitter ||
          !worldPosition
        ) {
          return;
        }

        definition.position.set(
          Number(
            worldPosition.x
          ) || 0,

          Number(
            worldPosition.y
          ) || 0,

          Number(
            worldPosition.z
          ) || 0
        );

        emitter.setAttribute(
          'position',
          {
            x:
              definition.position.x,

            y:
              definition.position.y,

            z:
              definition.position.z
          }
        );
      },


    /* ========================================================
       ONE-SHOT SOUND
    ======================================================== */

    playOneShot:
      function (
        id
      ) {
        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          return false;
        }

        const sound =
          this.getSound(
            id
          );

        if (
          !sound ||
          !sound.playSound
        ) {
          return false;
        }

        try {
          sound.playSound();

          return true;

        } catch (error) {
          console.warn(
            `Could not play one-shot ${id}:`,
            error
          );

          return false;
        }
      },


    /* ========================================================
       APPLY CURRENT PLAYBACK STATE
    ======================================================== */

    applyPlaybackState:
      function () {
        this.updateVolumes();

        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          this.pauseAllWithoutChangingIntent();

          return;
        }

        ROOM_SOUND_DEFINITIONS.forEach(
          (definition) => {
            if (
              definition.startAutomatically
            ) {
              this.desiredPlaying.add(
                definition.id
              );
            }
          }
        );

        if (
          roomsTVOn
        ) {
          this.desiredPlaying.add(
            'tvStaticSound'
          );

        } else {
          this.desiredPlaying.delete(
            'tvStaticSound'
          );

          this.pauseEmitterWithoutChangingIntent(
            'tvStaticSound'
          );
        }

        this.desiredPlaying.forEach(
          (id) => {
            this.playEmitter(
              id
            );
          }
        );
      },


    /* ========================================================
       PAUSE EVENT
    ======================================================== */

    onPauseChanged:
      function () {
        this.applyPlaybackState();
      },


    /* ========================================================
       ENTER VR RECOVERY
    ======================================================== */

    onEnterVR:
      function () {
        ensureRoomsAudioUnlocked(
          'enter-vr'
        );

        window.setTimeout(
          () => {
            ensureRoomsAudioUnlocked(
              'enter-vr-150ms'
            );
          },
          150
        );

        window.setTimeout(
          () => {
            ensureRoomsAudioUnlocked(
              'enter-vr-700ms'
            );
          },
          700
        );
      },


    /* ========================================================
       QUEST CONTROLLER RECOVERY
    ======================================================== */

    onControllerGesture:
      function () {
        ensureRoomsAudioUnlocked(
          'quest-controller'
        );
      },


    /* ========================================================
       ATTACH CONTROLLER EVENTS
    ======================================================== */

    attachControllerRecovery:
      function () {
        const targets = [
          document.querySelector(
            '#leftHand'
          ),

          document.querySelector(
            '#rightHand'
          )
        ].filter(
          Boolean
        );

        targets.forEach(
          (target) => {
            if (
              this.controllerTargets.includes(
                target
              )
            ) {
              return;
            }

            this.controllerTargets.push(
              target
            );

            this.controllerEvents.forEach(
              (eventName) => {
                target.addEventListener(
                  eventName,
                  this.onControllerGesture
                );
              }
            );
          }
        );
      },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {
        this.el.removeEventListener(
          'rooms-pause-changed',
          this.onPauseChanged
        );

        this.el.removeEventListener(
          'enter-vr',
          this.onEnterVR
        );

        this.controllerTargets.forEach(
          (target) => {
            this.controllerEvents.forEach(
              (eventName) => {
                target.removeEventListener(
                  eventName,
                  this.onControllerGesture
                );
              }
            );
          }
        );

        this.controllerTargets =
          [];

        this.emitters.forEach(
          (
            emitter,
            id
          ) => {
            const sound =
              emitter.components &&
              emitter.components.sound;

            try {
              if (
                sound &&
                sound.stopSound
              ) {
                sound.stopSound();
              }

            } catch (error) {
              /*
                Ignore cleanup errors.
              */
            }

            if (
              emitter.parentNode
            ) {
              emitter.parentNode.removeChild(
                emitter
              );
            }

            this.playingIds.delete(
              id
            );
          }
        );

        this.emitters.clear();

        this.desiredPlaying.clear();

        this.playingIds.clear();
      }
  }
);


/* ============================================================
   GET AUDIO MANAGER
============================================================ */

function getSpatialAudioManager() {
  const scene =
    getScene();

  if (!scene) {
    return null;
  }

  return (
    scene.components[
      'spatial-audio-manager'
    ] ||
    null
  );
}


/* ============================================================
   NON-BLOCKING HTML AUDIO FALLBACK UNLOCK

   This is only for compatibility with older jumpscare code.

   IMPORTANT:
   It NEVER blocks the ENABLE SOUND button.
============================================================ */

function tryUnlockLegacyHtmlAudio() {
  [
    '#footstepAudio',
    '#scareFootstepAudio'
  ].forEach(
    (selector) => {
      const audio =
        document.querySelector(
          selector
        );

      if (!audio) {
        return;
      }

      const previousVolume =
        audio.volume;

      audio.volume =
        0;

      try {
        const playResult =
          audio.play();

        if (
          playResult &&
          playResult.then
        ) {
          promiseWithTimeout(
            playResult,
            500,
            null
          )
            .catch(
              () => null
            )
            .finally(
              () => {
                audio.pause();

                audio.currentTime =
                  0;

                audio.volume =
                  previousVolume;
              }
            );

        } else {
          audio.pause();

          audio.currentTime =
            0;

          audio.volume =
            previousVolume;
        }

      } catch (error) {
        audio.pause();

        audio.currentTime =
          0;

        audio.volume =
          previousVolume;
      }
    }
  );
}


/* ============================================================
   CENTRAL AUDIO UNLOCK
============================================================ */

async function unlockRoomsAudioNow(
  source
) {
  const scene =
    getScene();

  const manager =
    getSpatialAudioManager();

  if (
    !scene ||
    !manager
  ) {
    console.warn(
      'Rooms Within audio manager is not ready yet.'
    );

    return false;
  }

  if (
    !manager.created
  ) {
    manager.createEmitters();
  }

  const contextStarted =
    await resumeRoomsAudioContext();

  roomsLastUnlockSource =
    String(
      source ||
      'unknown'
    );

  roomsAudioUnlocked =
    Boolean(
      contextStarted
    );

  scene.audioUnlocked =
    roomsAudioUnlocked;

  if (
    !roomsAudioUnlocked
  ) {
    const context =
      getRoomsAudioContext();

    console.warn(
      'Rooms Within audio is still locked.',
      {
        source:
          roomsLastUnlockSource,

        contextState:
          context
            ? context.state
            : 'no-context'
      }
    );

    return false;
  }

  /*
    Do NOT await these old HTML elements.
  */

  tryUnlockLegacyHtmlAudio();

  manager.playNormalAmbience();

  manager.applyPlaybackState();

  /*
    Sound components may finish decoding after the click.

    Reapply playback as they become ready.
  */

  [
    100,
    400,
    1000
  ].forEach(
    (milliseconds) => {
      window.setTimeout(
        () => {
          if (
            roomsAudioUnlocked &&
            !roomsMuted
          ) {
            manager.applyPlaybackState();
          }
        },
        milliseconds
      );
    }
  );

  updateRoomsVolumeUI();

  scene.emit(
    'audio-settings-changed',
    getRoomsAudioState(),
    false
  );

  console.log(
    'Rooms Within audio unlocked.',
    {
      source:
        roomsLastUnlockSource,

      contextState:
        getRoomsAudioContext()
          ? getRoomsAudioContext().state
          : 'no-context'
    }
  );

  return true;
}


/* ============================================================
   ENSURE AUDIO IS UNLOCKED
============================================================ */

function ensureRoomsAudioUnlocked(
  source
) {
  const context =
    getRoomsAudioContext();

  if (
    roomsAudioUnlocked &&
    (
      !context ||
      context.state ===
        'running'
    )
  ) {
    const manager =
      getSpatialAudioManager();

    if (
      manager
    ) {
      manager.applyPlaybackState();
    }

    return Promise.resolve(
      true
    );
  }

  if (
    roomsAudioUnlockPromise
  ) {
    return (
      roomsAudioUnlockPromise
    );
  }

  roomsAudioUnlockPromise =
    unlockRoomsAudioNow(
      source
    )
      .finally(
        () => {
          roomsAudioUnlockPromise =
            null;
        }
      );

  return (
    roomsAudioUnlockPromise
  );
}


/* ============================================================
   ENABLE SOUND BUTTON

   FIX:
   This has its own timeout.

   It can no longer stay on STARTING SOUND forever.
============================================================ */

async function enableSound() {
  const button =
    document.querySelector(
      '#soundButton'
    );

  if (
    button
  ) {
    button.textContent =
      'STARTING SOUND...';

    button.disabled =
      true;
  }

  let success =
    false;

  try {
    success =
      await promiseWithTimeout(
        ensureRoomsAudioUnlocked(
          'enable-sound-button'
        ),
        1800,
        false
      );

  } catch (error) {
    success =
      false;

    console.warn(
      'Enable sound failed:',
      error
    );
  }

  if (
    !button
  ) {
    return success;
  }

  if (
    success
  ) {
    button.textContent =
      'SOUND ENABLED';

    window.setTimeout(
      () => {
        button.style.display =
          'none';
      },
      650
    );

  } else {
    button.textContent =
      'TRY SOUND AGAIN';

    button.disabled =
      false;
  }

  return success;
}


/* ============================================================
   TV STATE
============================================================ */

function setRoomsTVState(
  shouldBeOn
) {
  roomsTVOn =
    Boolean(
      shouldBeOn
    );

  const manager =
    getSpatialAudioManager();

  if (
    !manager
  ) {
    return;
  }

  if (
    roomsTVOn
  ) {
    manager.desiredPlaying.add(
      'tvStaticSound'
    );

  } else {
    manager.desiredPlaying.delete(
      'tvStaticSound'
    );

    manager.pauseEmitterWithoutChangingIntent(
      'tvStaticSound'
    );
  }

  manager.applyPlaybackState();
}


/* ============================================================
   STANDALONE TV SOUND POSITION
============================================================ */

function setRoomsTVPosition(
  worldPosition
) {
  if (
    !worldPosition
  ) {
    return;
  }

  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(
        worldPosition.x
      ) || 0,

      Number(
        worldPosition.y
      ) || 0,

      Number(
        worldPosition.z
      ) || 0
    );

  const manager =
    getSpatialAudioManager();

  if (
    manager
  ) {
    manager.setEmitterPosition(
      'tvStaticSound',
      roomsTVWorldPosition
    );
  }

  console.log(
    'TV static sound position:',
    roomsTVWorldPosition
      .toArray()
      .map(
        (value) =>
          value.toFixed(
            2
          )
      )
  );
}


/* ============================================================
   THUNDER
============================================================ */

function playRoomsThunder() {
  const now =
    performance.now();

  if (
    now -
      roomsLastThunderTime <
      250 ||
    roomsMuted ||
    isRoomsPauseMenuOpen()
  ) {
    return false;
  }

  if (
    !roomsAudioUnlocked
  ) {
    return false;
  }

  const manager =
    getSpatialAudioManager();

  if (
    !manager
  ) {
    return false;
  }

  roomsLastThunderTime =
    now;

  return manager.playOneShot(
    'thunderSound'
  );
}


/* ============================================================
   MASTER VOLUME
============================================================ */

function changeRoomsVolume(
  amount
) {
  roomsMasterVolume =
    clamp01(
      roomsMasterVolume +
        Number(
          amount ||
          0
        )
    );

  applyRoomsAudioSettings();
}


/* ============================================================
   MUTE / UNMUTE
============================================================ */

function toggleRoomsMute() {
  /*
    If sound is still locked, pressing SOUND becomes an unlock
    attempt instead of muting a game that is already silent.
  */

  if (
    !roomsAudioUnlocked
  ) {
    roomsMuted =
      false;

    window.roomsMuted =
      false;

    ensureRoomsAudioUnlocked(
      'sound-toggle'
    )
      .then(
        () => {
          applyRoomsAudioSettings();
        }
      );

    updateRoomsVolumeUI();

    return false;
  }

  roomsMuted =
    !roomsMuted;

  window.roomsMuted =
    roomsMuted;

  applyRoomsAudioSettings();

  return roomsMuted;
}


/* ============================================================
   CURRENT AUDIO STATE
============================================================ */

function getRoomsAudioState() {
  const context =
    getRoomsAudioContext();

  return {
    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    unlocked:
      roomsAudioUnlocked,

    audioContextState:
      context
        ? context.state
        : 'no-context',

    lastUnlockSource:
      roomsLastUnlockSource
  };
}


/* ============================================================
   APPLY AUDIO SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  const manager =
    getSpatialAudioManager();

  if (
    manager
  ) {
    manager.updateVolumes();

    manager.applyPlaybackState();
  }

  /*
    Old HTML audio remains here only for compatibility with any
    older scare code that still uses these elements.
  */

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  if (
    footstep
  ) {
    footstep.volume =
      getPlayerFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      footstep.pause();
    }
  }

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (
    scareFootstep
  ) {
    scareFootstep.volume =
      getScareFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      scareFootstep.pause();
    }
  }

  updateRoomsVolumeUI();

  const scene =
    getScene();

  if (
    scene
  ) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }
}


/* ============================================================
   UPDATE SOUND UI
============================================================ */

function updateRoomsVolumeUI() {
  const percent =
    Math.round(
      roomsMasterVolume *
      100
    );

  const screenVolumeLabel =
    document.querySelector(
      '#screenVolumeLabel'
    );

  if (
    screenVolumeLabel
  ) {
    screenVolumeLabel.textContent =
      `${percent}%`;
  }

  const vrVolumeLabel =
    document.querySelector(
      '#vrVolumeLabel'
    );

  if (
    vrVolumeLabel
  ) {
    vrVolumeLabel.setAttribute(
      'value',
      `${percent}%`
    );
  }

  const soundText =
    roomsMuted
      ? 'SOUND: OFF'
      : 'SOUND: ON';

  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );

  if (
    screenSoundButton
  ) {
    screenSoundButton.textContent =
      soundText;
  }

  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (
    vrSoundLabel
  ) {
    vrSoundLabel.setAttribute(
      'value',
      soundText
    );
  }
}


/* ============================================================
   VR / A-FRAME FOOTSTEPS

   Footsteps also use A-Frame Web Audio so they work through the
   same headset audio path as the room sounds.
============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {
    schema: {
      minSpeed: {
        default:
          0.02
      },

      maxSpeed: {
        default:
          4
      },

      volume: {
        default:
          0.11
      }
    },


    init:
      function () {
        this.previousWorldPosition =
          new THREE.Vector3();

        this.currentWorldPosition =
          new THREE.Vector3();

        this.hasPreviousPosition =
          false;

        this.isPlaying =
          false;

        this.soundEntity =
          document.createElement(
            'a-entity'
          );

        this.soundEntity.setAttribute(
          'id',
          'playerFootstepSound'
        );

        this.soundEntity.setAttribute(
          'sound',
          {
            src:
              'url(sounds/842186__aardsreal__footstep-floor.wav)',

            autoplay:
              false,

            loop:
              true,

            positional:
              false,

            volume:
              getPlayerFootstepVolume()
          }
        );

        this.el.appendChild(
          this.soundEntity
        );
      },


    getSound:
      function () {
        if (
          !this.soundEntity ||
          !this.soundEntity.components
        ) {
          return null;
        }

        return (
          this.soundEntity.components.sound ||
          null
        );
      },


    stopSteps:
      function () {
        const sound =
          this.getSound();

        if (
          !sound
        ) {
          this.isPlaying =
            false;

          return;
        }

        try {
          if (
            sound.stopSound
          ) {
            sound.stopSound();

          } else if (
            sound.pauseSound
          ) {
            sound.pauseSound();
          }

        } catch (error) {
          /*
            Ignore stop errors.
          */
        }

        this.isPlaying =
          false;
      },


    pause:
      function () {
        this.stopSteps();

        this.hasPreviousPosition =
          false;
      },


    play:
      function () {
        this.hasPreviousPosition =
          false;
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime
        ) {
          return;
        }

        if (
          roomsMuted ||
          isRoomsPauseMenuOpen() ||
          !roomsAudioUnlocked
        ) {
          if (
            this.isPlaying
          ) {
            this.stopSteps();
          }

          this.hasPreviousPosition =
            false;

          return;
        }

        this.el.object3D.getWorldPosition(
          this.currentWorldPosition
        );

        if (
          !this.hasPreviousPosition
        ) {
          this.previousWorldPosition.copy(
            this.currentWorldPosition
          );

          this.hasPreviousPosition =
            true;

          return;
        }

        const deltaX =
          this.currentWorldPosition.x -
          this.previousWorldPosition.x;

        const deltaZ =
          this.currentWorldPosition.z -
          this.previousWorldPosition.z;

        const distance =
          Math.sqrt(
            deltaX *
              deltaX +
            deltaZ *
              deltaZ
          );

        const speed =
          distance /
          Math.max(
            deltaTime /
              1000,
            0.001
          );

        const isWalking =
          speed >=
            this.data.minSpeed &&
          speed <=
            this.data.maxSpeed;

        this.soundEntity.setAttribute(
          'sound',
          'volume',
          roomsMuted
            ? 0
            : this.data.volume *
              roomsMasterVolume
        );

        if (
          isWalking &&
          !this.isPlaying
        ) {
          const sound =
            this.getSound();

          if (
            sound &&
            sound.playSound
          ) {
            try {
              sound.playSound();

              this.isPlaying =
                true;

            } catch (error) {
              this.isPlaying =
                false;
            }
          }

        } else if (
          !isWalking &&
          this.isPlaying
        ) {
          this.stopSteps();
        }

        this.previousWorldPosition.copy(
          this.currentWorldPosition
        );
      },


    remove:
      function () {
        this.stopSteps();

        if (
          this.soundEntity &&
          this.soundEntity.parentNode
        ) {
          this.soundEntity.parentNode.removeChild(
            this.soundEntity
          );
        }

        this.soundEntity =
          null;
      }
  }
);


/* ============================================================
   DEBUG

   Open browser console and run:

   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {
  const scene =
    getScene();

  const manager =
    getSpatialAudioManager();

  const context =
    getRoomsAudioContext();

  const emitters =
    [];

  if (
    manager
  ) {
    manager.emitters.forEach(
      (
        emitter,
        id
      ) => {
        emitters.push(
          {
            id,

            componentReady:
              Boolean(
                emitter.components &&
                emitter.components.sound
              ),

            desiredPlaying:
              manager.desiredPlaying.has(
                id
              ),

            markedPlaying:
              manager.playingIds.has(
                id
              ),

            position:
              emitter.object3D.position.toArray()
          }
        );
      }
    );
  }

  return {
    immersiveXR:
      hasRoomsImmersiveXRSession(
        scene
      ),

    unlocked:
      roomsAudioUnlocked,

    contextState:
      context
        ? context.state
        : 'no-context',

    muted:
      roomsMuted,

    masterVolume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    tvWorldPosition:
      roomsTVWorldPosition
        ? roomsTVWorldPosition.toArray()
        : null,

    lastUnlockSource:
      roomsLastUnlockSource,

    managerReady:
      Boolean(
        manager
      ),

    emitters
  };
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.enableSound =
  enableSound;

window.ensureRoomsAudioUnlocked =
  ensureRoomsAudioUnlocked;

window.setRoomsTVState =
  setRoomsTVState;

window.setRoomsTVPosition =
  setRoomsTVPosition;

window.playRoomsThunder =
  playRoomsThunder;

window.changeRoomsVolume =
  changeRoomsVolume;

window.toggleRoomsMute =
  toggleRoomsMute;

window.getRoomsAudioState =
  getRoomsAudioState;

window.applyRoomsAudioSettings =
  applyRoomsAudioSettings;

window.updateRoomsVolumeUI =
  updateRoomsVolumeUI;

window.getRoomsAudioDebug =
  getRoomsAudioDebug;


/* ============================================================
   STARTUP

   Notice:
   There is deliberately NO generic pointerdown auto-unlock here.

   That was part of the bug that could make ENABLE SOUND wait on
   another unfinished unlock request.
============================================================ */

window.addEventListener(
  'DOMContentLoaded',
  () => {
    updateRoomsVolumeUI();
  }
);