/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — A-FRAME / QUEST WEBXR AUDIO

   IMPORTANT CHANGE:
   - Room ambience, TV static and thunder now use A-Frame's
     `sound` component / THREE.AudioListener instead of relying on
     normal HTMLAudioElement playback for the main VR soundscape.
   - This is the audio path that follows the WebXR camera/listener.
   - AudioContext resume is attempted from real user gestures,
     Enter VR, and Quest controller input.
   - Existing HTML audio elements are still unlocked as a fallback
     for any other file that may use them.
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

let roomsLastUnlockSource =
  'none';

let roomsLastThunderTime =
  -Infinity;


window.roomsMuted =
  roomsMuted;


/* ============================================================
   SOUND DEFINITIONS
============================================================ */

const ROOM_SOUND_DEFINITIONS = [

  {
    id:
      'fanSound',

    src:
      'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',

    position:
      new THREE.Vector3(
        -3.5,
        2.4,
        -1.0
      ),

    volume:
      0.24,

    loop:
      true,

    startAutomatically:
      true,

    positional:
      true,

    refDistance:
      1.5,

    maxDistance:
      12,

    rolloffFactor:
      1.25
  },


  {
    id:
      'rainSound',

    src:
      'sounds/bedroom-rain.wav',

    position:
      new THREE.Vector3(
        -2.0,
        1.6,
        -3.0
      ),

    volume:
      0.20,

    loop:
      true,

    startAutomatically:
      true,

    positional:
      true,

    refDistance:
      1.4,

    maxDistance:
      11,

    rolloffFactor:
      1.25
  },


  {
    id:
      'fluorescentSound',

    src:
      'sounds/fluorescent-light.wav',

    position:
      new THREE.Vector3(
        2.5,
        2.5,
        1.5
      ),

    volume:
      0.14,

    loop:
      true,

    startAutomatically:
      true,

    positional:
      true,

    refDistance:
      1.2,

    maxDistance:
      9,

    rolloffFactor:
      1.4
  },


  {
    id:
      'tvStaticSound',

    src:
      'sounds/tv-static.mp3',

    position:
      new THREE.Vector3(
        0,
        1.2,
        0
      ),

    volume:
      0.18,

    loop:
      true,

    startAutomatically:
      false,

    positional:
      true,

    refDistance:
      0.8,

    maxDistance:
      7,

    rolloffFactor:
      1.6
  },


  {
    id:
      'thunderSound',

    src:
      'sounds/thunder.wav',

    position:
      new THREE.Vector3(
        0,
        0,
        0
      ),

    volume:
      0.55,

    loop:
      false,

    startAutomatically:
      false,

    positional:
      false,

    refDistance:
      1,

    maxDistance:
      100,

    rolloffFactor:
      1
  }

];


/* ============================================================
   HELPERS
============================================================ */

function clamp01(
  value
) {

  return Math.max(

    0,

    Math.min(
      1,
      Number(
        value
      ) || 0
    )

  );

}


function getScene() {

  return document
    .querySelector(
      'a-scene'
    );

}


function getRoomSoundDefinition(
  id
) {

  return (

    ROOM_SOUND_DEFINITIONS
      .find(
        (definition) =>
          definition.id ===
          id
      ) ||

    null

  );

}


function hasRoomsImmersiveXRSession(
  scene
) {

  try {

    return Boolean(

      scene &&

      scene.renderer &&

      scene.renderer.xr &&

      (

        scene.renderer
          .xr
          .isPresenting ||

        (

          scene.renderer
            .xr
            .getSession &&

          scene.renderer
            .xr
            .getSession()

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


function isRoomsPauseMenuOpen() {

  if (

    window.roomsPaused ||

    window.roomsInputLocked

  ) {

    return true;

  }


  const desktopOverlay =

    document
      .querySelector(
        '#screenPauseMenuOverlay'
      );


  if (

    desktopOverlay &&

    desktopOverlay
      .classList
      .contains(
        'is-open'
      )

  ) {

    return true;

  }


  const vrPanel =

    document
      .querySelector(
        '#vrPausePanel'
      );


  if (
    vrPanel
  ) {

    const visible =

      vrPanel
        .getAttribute(
          'visible'
        );


    if (

      visible ===
        true ||

      visible ===
        'true'

    ) {

      return true;

    }

  }


  return false;

}


/* ============================================================
   GET A-FRAME / THREE WEB AUDIO CONTEXT
============================================================ */

function getRoomsAudioContext() {

  try {

    if (

      typeof THREE !==
        'undefined' &&

      THREE.AudioContext &&

      THREE.AudioContext
        .getContext

    ) {

      const context =

        THREE.AudioContext
          .getContext();


      if (
        context
      ) {

        return context;

      }

    }

  }

  catch (
    error
  ) {

    /*
      Keep trying below.
    */

  }


  const scene =
    getScene();


  if (

    scene &&

    scene.audioListener &&

    scene.audioListener
      .context

  ) {

    return (
      scene.audioListener
        .context
    );

  }


  return null;

}


/* ============================================================
   FINAL VOLUME
============================================================ */

function getFinalVolume(
  definition
) {

  if (

    !definition ||

    roomsMuted

  ) {

    return 0;

  }


  return clamp01(

    definition.volume *

    roomsMasterVolume

  );

}


function getPlayerFootstepVolume() {

  if (
    roomsMuted
  ) {

    return 0;

  }


  return clamp01(

    0.11 *

    roomsMasterVolume

  );

}


function getScareFootstepVolume() {

  if (
    roomsMuted
  ) {

    return 0;

  }


  return clamp01(

    0.30 *

    roomsMasterVolume

  );

}


/* ============================================================
   A-FRAME POSITIONAL AUDIO MANAGER
============================================================ */

AFRAME.registerComponent(

  'spatial-audio-manager',

  {

    init:
      function () {

        this.emitters =
          new Map();


        this.desiredPlaying =
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

          this.createEmitters
            .bind(
              this
            );


        this.onPauseChanged =

          this.onPauseChanged
            .bind(
              this
            );


        this.onEnterVR =

          this.onEnterVR
            .bind(
              this
            );


        this.onControllerGesture =

          this.onControllerGesture
            .bind(
              this
            );


        this.attachControllerRecovery =

          this.attachControllerRecovery
            .bind(
              this
            );


        this.el
          .addEventListener(

            'rooms-pause-changed',

            this.onPauseChanged

          );


        this.el
          .addEventListener(

            'enter-vr',

            this.onEnterVR

          );


        if (
          this.el.hasLoaded
        ) {

          this
            .createEmitters();


          this
            .attachControllerRecovery();

        }

        else {

          this.el
            .addEventListener(

              'loaded',

              () => {

                this
                  .createEmitters();


                this
                  .attachControllerRecovery();

              },

              {
                once:
                  true
              }

            );

        }


        window.setTimeout(

          this
            .attachControllerRecovery,

          500

        );


        window.setTimeout(

          this
            .attachControllerRecovery,

          1500

        );

      },


    /* ========================================================
       CREATE VR SOUND EMITTERS
    ======================================================== */

    createEmitters:
      function () {

        if (
          this.created
        ) {

          return;

        }


        this.created =
          true;


        ROOM_SOUND_DEFINITIONS
          .forEach(

            (
              definition
            ) => {

              const emitter =

                document
                  .createElement(
                    'a-entity'
                  );


              emitter
                .setAttribute(

                  'id',

                  definition.id

                );


              emitter
                .classList
                .add(
                  'spatial-sound'
                );


              emitter
                .setAttribute(

                  'position',

                  {

                    x:
                      definition
                        .position
                        .x,

                    y:
                      definition
                        .position
                        .y,

                    z:
                      definition
                        .position
                        .z

                  }

                );


              emitter
                .setAttribute(

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
                      definition
                        .refDistance,

                    maxDistance:
                      definition
                        .maxDistance,

                    rolloffFactor:
                      definition
                        .rolloffFactor,

                    poolSize:

                      definition.id ===
                        'thunderSound'

                        ? 2

                        : 1

                  }

                );


              emitter
                .addEventListener(

                  'sound-loaded',

                  () => {

                    console.log(

                      `A-Frame sound ready: ${definition.id}`

                    );


                    if (

                      this
                        .desiredPlaying
                        .has(
                          definition.id
                        ) &&

                      roomsAudioUnlocked &&

                      !roomsMuted &&

                      !isRoomsPauseMenuOpen()

                    ) {

                      this
                        .playEmitter(
                          definition.id
                        );

                    }

                  }

                );


              this.el
                .appendChild(
                  emitter
                );


              this.emitters
                .set(

                  definition.id,

                  emitter

                );


              if (
                definition
                  .startAutomatically
              ) {

                this
                  .desiredPlaying
                  .add(
                    definition.id
                  );

              }

            }

          );


        if (
          roomsTVWorldPosition
        ) {

          this
            .setEmitterPosition(

              'tvStaticSound',

              roomsTVWorldPosition

            );

        }


        this
          .updateVolumes();

      },


    /* ========================================================
       GET EMITTER
    ======================================================== */

    getEmitter:
      function (
        id
      ) {

        return (

          this.emitters
            .get(
              id
            ) ||

          null

        );

      },


    /* ========================================================
       GET SOUND COMPONENT
    ======================================================== */

    getSound:
      function (
        id
      ) {

        const emitter =

          this
            .getEmitter(
              id
            );


        if (

          !emitter ||

          !emitter.components

        ) {

          return null;

        }


        return (

          emitter
            .components
            .sound ||

          null

        );

      },


    /* ========================================================
       UPDATE VOLUMES
    ======================================================== */

    updateVolumes:
      function () {

        ROOM_SOUND_DEFINITIONS
          .forEach(

            (
              definition
            ) => {

              const emitter =

                this
                  .getEmitter(
                    definition.id
                  );


              if (
                !emitter
              ) {

                return;

              }


              emitter
                .setAttribute(

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
       PLAY LOOPING EMITTER
    ======================================================== */

    playEmitter:
      function (
        id
      ) {

        this
          .desiredPlaying
          .add(
            id
          );


        if (

          !roomsAudioUnlocked ||

          roomsMuted ||

          isRoomsPauseMenuOpen()

        ) {

          return false;

        }


        const sound =

          this
            .getSound(
              id
            );


        if (

          !sound ||

          !sound.playSound

        ) {

          return false;

        }


        try {

          sound
            .playSound();


          return true;

        }

        catch (
          error
        ) {

          console.warn(

            `Could not play ${id}:`,

            error

          );


          return false;

        }

      },


    /* ========================================================
       STOP EMITTER
    ======================================================== */

    stopEmitter:
      function (
        id
      ) {

        this
          .desiredPlaying
          .delete(
            id
          );


        const sound =

          this
            .getSound(
              id
            );


        if (
          !sound
        ) {

          return;

        }


        try {

          if (
            sound.stopSound
          ) {

            sound
              .stopSound();

          }

          else if (
            sound.pauseSound
          ) {

            sound
              .pauseSound();

          }

        }

        catch (
          error
        ) {

          console.warn(

            `Could not stop ${id}:`,

            error

          );

        }

      },


    /* ========================================================
       PAUSE WITHOUT LOSING INTENT
    ======================================================== */

    pauseEmitterWithoutChangingIntent:
      function (
        id
      ) {

        const sound =

          this
            .getSound(
              id
            );


        if (
          !sound
        ) {

          return;

        }


        try {

          if (
            sound.pauseSound
          ) {

            sound
              .pauseSound();

          }

          else if (
            sound.stopSound
          ) {

            sound
              .stopSound();

          }

        }

        catch (
          error
        ) {

          console.warn(

            `Could not pause ${id}:`,

            error

          );

        }

      },


    /* ========================================================
       PAUSE EVERYTHING
    ======================================================== */

    pauseAllWithoutChangingIntent:
      function () {

        this.emitters
          .forEach(

            (
              emitter,
              id
            ) => {

              this
                .pauseEmitterWithoutChangingIntent(
                  id
                );

            }

          );

      },


    /* ========================================================
       NORMAL ROOM AMBIENCE
    ======================================================== */

    playNormalAmbience:
      function () {

        ROOM_SOUND_DEFINITIONS
          .forEach(

            (
              definition
            ) => {

              if (
                definition
                  .startAutomatically
              ) {

                this
                  .desiredPlaying
                  .add(
                    definition.id
                  );

              }

            }

          );


        this
          .applyPlaybackState();

      },


    /* ========================================================
       MOVE A POSITIONAL SOUND
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

          this
            .getEmitter(
              id
            );


        if (

          !definition ||

          !emitter ||

          !worldPosition

        ) {

          return;

        }


        definition
          .position
          .set(

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


        emitter
          .setAttribute(

            'position',

            {

              x:
                definition
                  .position
                  .x,

              y:
                definition
                  .position
                  .y,

              z:
                definition
                  .position
                  .z

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

          this
            .getSound(
              id
            );


        if (

          !sound ||

          !sound.playSound

        ) {

          return false;

        }


        try {

          if (
            sound.stopSound
          ) {

            sound
              .stopSound();

          }


          sound
            .playSound();


          return true;

        }

        catch (
          error
        ) {

          console.warn(

            `Could not play one-shot ${id}:`,

            error

          );


          return false;

        }

      },


    /* ========================================================
       APPLY PLAYBACK STATE
    ======================================================== */

    applyPlaybackState:
      function () {

        this
          .updateVolumes();


        if (

          !roomsAudioUnlocked ||

          roomsMuted ||

          isRoomsPauseMenuOpen()

        ) {

          this
            .pauseAllWithoutChangingIntent();


          return;

        }


        ROOM_SOUND_DEFINITIONS
          .forEach(

            (
              definition
            ) => {

              if (
                definition
                  .startAutomatically
              ) {

                this
                  .desiredPlaying
                  .add(
                    definition.id
                  );

              }

            }

          );


        if (
          roomsTVOn
        ) {

          this
            .desiredPlaying
            .add(
              'tvStaticSound'
            );

        }

        else {

          this
            .desiredPlaying
            .delete(
              'tvStaticSound'
            );


          this
            .pauseEmitterWithoutChangingIntent(
              'tvStaticSound'
            );

        }


        this
          .desiredPlaying
          .forEach(

            (
              id
            ) => {

              this
                .playEmitter(
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

        this
          .applyPlaybackState();

      },


    /* ========================================================
       ENTER VR AUDIO RECOVERY
    ======================================================== */

    onEnterVR:
      function () {

        ensureRoomsAudioUnlocked(
          'enter-vr'
        );


        window.setTimeout(

          () => {

            ensureRoomsAudioUnlocked(
              'enter-vr-100ms'
            );

          },

          100

        );


        window.setTimeout(

          () => {

            ensureRoomsAudioUnlocked(
              'enter-vr-500ms'
            );

          },

          500

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
       CONTROLLER LISTENERS
    ======================================================== */

    attachControllerRecovery:
      function () {

        const targets = [

          document
            .querySelector(
              '#leftHand'
            ),

          document
            .querySelector(
              '#rightHand'
            )

        ]
          .filter(
            Boolean
          );


        targets
          .forEach(

            (
              target
            ) => {

              if (

                this
                  .controllerTargets
                  .includes(
                    target
                  )

              ) {

                return;

              }


              this
                .controllerTargets
                .push(
                  target
                );


              this
                .controllerEvents
                .forEach(

                  (
                    eventName
                  ) => {

                    target
                      .addEventListener(

                        eventName,

                        this
                          .onControllerGesture

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

        this.el
          .removeEventListener(

            'rooms-pause-changed',

            this
              .onPauseChanged

          );


        this.el
          .removeEventListener(

            'enter-vr',

            this
              .onEnterVR

          );


        this
          .controllerTargets
          .forEach(

            (
              target
            ) => {

              this
                .controllerEvents
                .forEach(

                  (
                    eventName
                  ) => {

                    target
                      .removeEventListener(

                        eventName,

                        this
                          .onControllerGesture

                      );

                  }

                );

            }

          );


        this.controllerTargets =
          [];


        this.emitters
          .forEach(

            (
              emitter
            ) => {

              const sound =

                emitter.components &&

                emitter.components
                  .sound;


              if (
                sound
              ) {

                try {

                  if (
                    sound.stopSound
                  ) {

                    sound
                      .stopSound();

                  }

                }

                catch (
                  error
                ) {

                  /*
                    Ignore cleanup error.
                  */

                }

              }


              if (
                emitter.parentNode
              ) {

                emitter
                  .parentNode
                  .removeChild(
                    emitter
                  );

              }

            }

          );


        this.emitters
          .clear();


        this.desiredPlaying
          .clear();

      }

  }

);


/* ============================================================
   GET AUDIO MANAGER
============================================================ */

function getSpatialAudioManager() {

  const scene =
    getScene();


  if (
    !scene
  ) {

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
   UNLOCK OLD HTML AUDIO TOO

   This keeps compatibility with ui-scare.js if that file directly
   plays one of the existing HTML audio elements.
============================================================ */

async function unlockLegacyHtmlAudio() {

  const ids = [

    'footstepAudio',

    'scareFootstepAudio'

  ];


  let successCount =
    0;


  for (
    const id of ids
  ) {

    const audio =

      document
        .querySelector(
          `#${id}`
        );


    if (
      !audio
    ) {

      continue;

    }


    const oldVolume =
      audio.volume;


    try {

      audio.volume =
        0;


      const result =
        audio.play();


      if (

        result &&

        typeof result.then ===
          'function'

      ) {

        await result;

      }


      audio.pause();


      audio.currentTime =
        0;


      audio.volume =
        oldVolume;


      successCount +=
        1;

    }

    catch (
      error
    ) {

      audio.pause();


      audio.currentTime =
        0;


      audio.volume =
        oldVolume;

    }

  }


  return successCount;

}


/* ============================================================
   ACTUAL WEB AUDIO UNLOCK
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

    return false;

  }


  if (
    !manager.created
  ) {

    manager
      .createEmitters();

  }


  const context =
    getRoomsAudioContext();


  if (
    context
  ) {

    try {

      if (

        context.state ===
          'suspended' ||

        context.state ===
          'interrupted'

      ) {

        await context
          .resume();

      }

    }

    catch (
      error
    ) {

      console.warn(

        'Could not resume A-Frame Web Audio context:',

        error

      );

    }

  }


  await unlockLegacyHtmlAudio();


  const refreshedContext =
    getRoomsAudioContext();


  const contextRunning =

    !refreshedContext ||

    refreshedContext.state ===
      'running';


  roomsAudioUnlocked =
    Boolean(
      contextRunning
    );


  roomsLastUnlockSource =
    String(
      source ||
      'unknown'
    );


  scene.audioUnlocked =
    roomsAudioUnlocked;


  if (
    !roomsAudioUnlocked
  ) {

    console.warn(

      `Rooms audio is still locked after ${roomsLastUnlockSource}. AudioContext state:`,

      refreshedContext

        ? refreshedContext
            .state

        : 'no-context'

    );


    return false;

  }


  manager
    .playNormalAmbience();


  manager
    .applyPlaybackState();


  applyRoomsAudioSettings();


  console.log(

    `Rooms Within VR audio unlocked from ${roomsLastUnlockSource}. AudioContext:`,

    refreshedContext

      ? refreshedContext
          .state

      : 'no-context'

  );


  return true;

}


/* ============================================================
   ENSURE AUDIO UNLOCKED
============================================================ */

function ensureRoomsAudioUnlocked(
  source
) {

  if (
    roomsAudioUnlocked
  ) {

    const context =
      getRoomsAudioContext();


    if (

      !context ||

      context.state ===
        'running'

    ) {

      const manager =
        getSpatialAudioManager();


      if (
        manager
      ) {

        manager
          .applyPlaybackState();

      }


      return Promise
        .resolve(
          true
        );

    }


    roomsAudioUnlocked =
      false;

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
============================================================ */

async function enableSound() {

  const button =

    document
      .querySelector(
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


  const success =

    await ensureRoomsAudioUnlocked(
      'enable-sound-button'
    );


  if (
    button
  ) {

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

    }

    else {

      button.textContent =
        'TRY SOUND AGAIN';


      button.disabled =
        false;

    }

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

    manager
      .desiredPlaying
      .add(
        'tvStaticSound'
      );

  }

  else {

    manager
      .desiredPlaying
      .delete(
        'tvStaticSound'
      );


    manager
      .pauseEmitterWithoutChangingIntent(
        'tvStaticSound'
      );

  }


  manager
    .applyPlaybackState();

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

    manager
      .setEmitterPosition(

        'tvStaticSound',

        roomsTVWorldPosition

      );

  }


  console.log(

    'TV static sound position:',

    roomsTVWorldPosition
      .toArray()
      .map(

        (
          value
        ) =>
          value
            .toFixed(
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

    ensureRoomsAudioUnlocked(
      'thunder-request'
    );


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


  return manager
    .playOneShot(
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
    If the player entered Quest VR before audio was unlocked,
    the first SOUND press becomes an unlock gesture instead of
    muting an already-silent game.
  */

  if (
    !roomsAudioUnlocked
  ) {

    roomsMuted =
      false;


    window.roomsMuted =
      false;


    ensureRoomsAudioUnlocked(
      'vr-sound-button'
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
   AUDIO STATE
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

    manager
      .updateVolumes();


    manager
      .applyPlaybackState();

  }


  const footstep =

    document
      .querySelector(
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

    document
      .querySelector(
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

    scene
      .emit(

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

    document
      .querySelector(
        '#screenVolumeLabel'
      );


  if (
    screenVolumeLabel
  ) {

    screenVolumeLabel
      .textContent =
      `${percent}%`;

  }


  const vrVolumeLabel =

    document
      .querySelector(
        '#vrVolumeLabel'
      );


  if (
    vrVolumeLabel
  ) {

    vrVolumeLabel
      .setAttribute(

        'value',

        `${percent}%`

      );

  }


  const soundText =

    roomsMuted

      ? 'SOUND: OFF'

      : 'SOUND: ON';


  const screenSoundButton =

    document
      .querySelector(
        '#screenSoundButton'
      );


  if (
    screenSoundButton
  ) {

    screenSoundButton
      .textContent =
      soundText;

  }


  const vrSoundLabel =

    document
      .querySelector(
        '#vrSoundLabel'
      );


  if (
    vrSoundLabel
  ) {

    vrSoundLabel
      .setAttribute(

        'value',

        soundText

      );

  }

}


/* ============================================================
   A-FRAME PLAYER FOOTSTEPS

   These use the SAME Web Audio path as the rest of the VR sound.
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

          new THREE
            .Vector3();


        this.currentWorldPosition =

          new THREE
            .Vector3();


        this.hasPreviousPosition =
          false;


        this.isPlaying =
          false;


        this.soundEntity =

          document
            .createElement(
              'a-entity'
            );


        this.soundEntity
          .setAttribute(

            'id',

            'playerFootstepSound'

          );


        this.soundEntity
          .setAttribute(

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


        this.el
          .appendChild(
            this.soundEntity
          );

      },


    getSound:
      function () {

        if (

          !this.soundEntity ||

          !this.soundEntity
            .components

        ) {

          return null;

        }


        return (

          this.soundEntity
            .components
            .sound ||

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

            sound
              .stopSound();

          }

          else if (
            sound.pauseSound
          ) {

            sound
              .pauseSound();

          }

        }

        catch (
          error
        ) {

          /*
            Ignore stop error.
          */

        }


        this.isPlaying =
          false;

      },


    pause:
      function () {

        this
          .stopSteps();


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

            this
              .stopSteps();

          }


          this.hasPreviousPosition =
            false;


          return;

        }


        this.el
          .object3D
          .getWorldPosition(
            this.currentWorldPosition
          );


        if (
          !this.hasPreviousPosition
        ) {

          this.previousWorldPosition
            .copy(
              this.currentWorldPosition
            );


          this.hasPreviousPosition =
            true;


          return;

        }


        const deltaX =

          this.currentWorldPosition
            .x -

          this.previousWorldPosition
            .x;


        const deltaZ =

          this.currentWorldPosition
            .z -

          this.previousWorldPosition
            .z;


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


        this.soundEntity
          .setAttribute(

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

              sound
                .playSound();


              this.isPlaying =
                true;

            }

            catch (
              error
            ) {

              this.isPlaying =
                false;

            }

          }

        }

        else if (

          !isWalking &&

          this.isPlaying

        ) {

          this
            .stopSteps();

        }


        this.previousWorldPosition
          .copy(
            this.currentWorldPosition
          );

      },


    remove:
      function () {

        this
          .stopSteps();


        if (

          this.soundEntity &&

          this.soundEntity
            .parentNode

        ) {

          this.soundEntity
            .parentNode
            .removeChild(
              this.soundEntity
            );

        }


        this.soundEntity =
          null;

      }

  }

);


/* ============================================================
   USER-GESTURE AUDIO RECOVERY

   When the Quest user presses ENTER VR, that begins as a browser
   pointer gesture. We use that same gesture to resume Web Audio.
============================================================ */

function setupRoomsAudioGestureRecovery() {

  const attempt =
    () => {

      ensureRoomsAudioUnlocked(
        'page-user-gesture'
      );

    };


  window
    .addEventListener(

      'pointerdown',

      attempt,

      {
        passive:
          true
      }

    );


  window
    .addEventListener(

      'touchstart',

      attempt,

      {
        passive:
          true
      }

    );


  window
    .addEventListener(

      'keydown',

      attempt

    );

}


/* ============================================================
   DEBUG

   Console:
   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {

  const manager =
    getSpatialAudioManager();


  const context =
    getRoomsAudioContext();


  const emitters =
    [];


  if (
    manager
  ) {

    manager.emitters
      .forEach(

        (
          emitter,
          id
        ) => {

          const component =

            emitter.components &&

            emitter.components
              .sound;


          emitters
            .push(
              {

                id,


                found:
                  Boolean(
                    emitter
                  ),


                componentReady:
                  Boolean(
                    component
                  ),


                desiredPlaying:

                  manager
                    .desiredPlaying
                    .has(
                      id
                    ),


                position:

                  emitter
                    .object3D
                    .position
                    .toArray()

              }
            );

        }

      );

  }


  const scene =
    getScene();


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

        ? roomsTVWorldPosition
            .toArray()

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
============================================================ */

window.addEventListener(

  'DOMContentLoaded',

  () => {

    setupRoomsAudioGestureRecovery();


    updateRoomsVolumeUI();

  }

);