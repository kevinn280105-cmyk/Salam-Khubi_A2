/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — QUEST / VR AUDIO RECOVERY

   Goals:
   - Reliable ambience on Mac + Meta Quest browser.
   - Native HTMLAudioElement playback for broad browser support.
   - Distance-aware fan, rain, fluorescent buzz, and TV static.
   - Standalone #tv sound position support.
   - Thunder support for engine-environment.js.
   - ENABLE SOUND button still works.
   - Entering VR automatically attempts to unlock audio.
   - First Quest controller interaction can recover locked audio.
   - VR SOUND button can recover audio even if ENABLE SOUND was
     never pressed before entering the headset.
   - Pause / mute state is respected.
   - Footsteps remain quieter than ambience.
============================================================ */


/* ============================================================
   GLOBAL AUDIO STATE
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;
let roomsAudioUnlockInProgress = null;
let roomsLastUnlockSource = 'none';
let roomsLastUnlockSuccess = false;
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;


/* ============================================================
   SOUND DEFINITIONS

   Ambience uses manual distance fading. This keeps the audio
   reliable in Quest Browser while still making room sounds become
   quieter as the player walks away.

   The TV position is replaced automatically by #tv through
   engine-interactions.js -> setRoomsTVPosition().
============================================================ */

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1.0),
    baseVolume: 0.24,
    fullVolumeDistance: 2.2,
    maxDistance: 11.0,
    loop: true,
    startAutomatically: true,
    global: false
  },

  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2.0, 1.6, -3.0),
    baseVolume: 0.20,
    fullVolumeDistance: 2.5,
    maxDistance: 12.0,
    loop: true,
    startAutomatically: true,
    global: false
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    baseVolume: 0.14,
    fullVolumeDistance: 2.0,
    maxDistance: 9.0,
    loop: true,
    startAutomatically: true,
    global: false
  },

  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1.2, 0),
    baseVolume: 0.18,
    fullVolumeDistance: 1.6,
    maxDistance: 7.0,
    loop: true,
    startAutomatically: false,
    global: false
  },

  {
    id: 'thunderSound',
    src: 'sounds/thunder.wav',
    position: new THREE.Vector3(0, 0, 0),
    baseVolume: 0.55,
    fullVolumeDistance: 999,
    maxDistance: 1000,
    loop: false,
    startAutomatically: false,
    global: true
  }
];


/* ============================================================
   GENERAL HELPERS
============================================================ */

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}


function getRoomSoundDefinition(id) {
  return (
    ROOM_SOUND_DEFINITIONS.find(
      (definition) =>
        definition.id === id
    ) || null
  );
}


function getScene() {
  return document.querySelector(
    'a-scene'
  );
}


function getCameraEntity() {
  return (
    document.querySelector('#cam') ||
    document.querySelector('[camera]')
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
  }

  catch (error) {
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
    document.querySelector(
      '#screenPauseMenuOverlay'
    );


  if (
    desktopOverlay &&
    desktopOverlay.classList.contains(
      'is-open'
    )
  ) {
    return true;
  }


  const vrPanel =
    document.querySelector(
      '#vrPausePanel'
    );


  if (vrPanel) {
    const visible =
      vrPanel.getAttribute(
        'visible'
      );


    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }


  return false;
}


function getPlayerFootstepVolume() {
  if (roomsMuted) {
    return 0;
  }


  return (
    0.11 *
    roomsMasterVolume
  );
}


function getScareFootstepVolume() {
  if (roomsMuted) {
    return 0;
  }


  return (
    0.30 *
    roomsMasterVolume
  );
}


/* ============================================================
   MANUAL DISTANCE FADING

   1.0 inside fullVolumeDistance.
   Smoothly fades to 0 at maxDistance.
============================================================ */

function getDistanceGain(
  distance,
  definition
) {
  if (!definition) {
    return 0;
  }


  if (definition.global) {
    return 1;
  }


  const d = Math.max(
    0,
    Number(distance) || 0
  );


  if (
    d <=
    definition.fullVolumeDistance
  ) {
    return 1;
  }


  if (
    d >=
    definition.maxDistance
  ) {
    return 0;
  }


  const range = Math.max(
    0.001,
    definition.maxDistance -
      definition.fullVolumeDistance
  );


  const normalized = clamp01(
    (
      d -
      definition.fullVolumeDistance
    ) /
      range
  );


  const smooth =
    normalized *
    normalized *
    (
      3 -
      2 * normalized
    );


  return 1 - smooth;
}


/* ============================================================
   NATIVE AUDIO MANAGER
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init: function () {
      this.tracks = new Map();

      this.desiredPlaying =
        new Set();

      this.created = false;

      this.lastDistanceUpdate = 0;

      this.playerWorldPosition =
        new THREE.Vector3();


      this.recoveryTargets = [];


      this.recoveryEvents = [
        'triggerdown',
        'gripdown',
        'squeezestart',
        'abuttondown',
        'bbuttondown',
        'xbuttondown',
        'ybuttondown'
      ];


      this.createTracks =
        this.createTracks.bind(
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


      this.attachQuestRecoveryListeners =
        this.attachQuestRecoveryListeners.bind(
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
        this.createTracks();

        this.attachQuestRecoveryListeners();
      }

      else {
        this.el.addEventListener(
          'loaded',
          () => {
            this.createTracks();

            this.attachQuestRecoveryListeners();
          },
          {
            once: true
          }
        );
      }


      window.setTimeout(
        this.attachQuestRecoveryListeners,
        500
      );


      window.setTimeout(
        this.attachQuestRecoveryListeners,
        1500
      );
    },


    /* ========================================================
       CREATE AUDIO TRACKS
    ======================================================== */

    createTracks: function () {
      if (this.created) {
        return;
      }


      this.created = true;


      ROOM_SOUND_DEFINITIONS.forEach(
        (definition) => {
          const audio =
            new Audio();


          audio.id =
            definition.id;


          audio.src =
            definition.src;


          audio.preload =
            'auto';


          audio.loop =
            Boolean(
              definition.loop
            );


          audio.playsInline =
            true;


          audio.setAttribute(
            'playsinline',
            ''
          );


          audio.setAttribute(
            'webkit-playsinline',
            ''
          );


          audio.volume = 0;


          audio.addEventListener(
            'error',
            () => {
              console.error(
                `Audio failed to load: ${definition.src}`
              );
            }
          );


          audio.addEventListener(
            'canplaythrough',
            () => {
              console.log(
                `Audio ready: ${definition.id}`
              );
            },
            {
              once: true
            }
          );


          document.body.appendChild(
            audio
          );


          this.tracks.set(
            definition.id,
            {
              definition,
              audio,
              lastDistance:
                Infinity,
              lastGain:
                0
            }
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


      this.updateVolumes(
        true
      );
    },


    /* ========================================================
       GET TRACK
    ======================================================== */

    getTrack: function (
      id
    ) {
      return (
        this.tracks.get(
          id
        ) ||
        null
      );
    },


    /* ========================================================
       PLAYER POSITION
    ======================================================== */

    getPlayerPosition:
      function () {
        const camera =
          getCameraEntity();


        if (!camera) {
          return null;
        }


        camera.object3D
          .getWorldPosition(
            this.playerWorldPosition
          );


        return (
          this.playerWorldPosition
        );
      },


    /* ========================================================
       CALCULATE VOLUME
    ======================================================== */

    calculateTrackVolume:
      function (
        track,
        playerPosition
      ) {
        if (
          !track ||
          !track.definition ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          return 0;
        }


        const definition =
          track.definition;


        if (
          definition.global
        ) {
          track.lastDistance = 0;

          track.lastGain = 1;


          return clamp01(
            definition.baseVolume *
              roomsMasterVolume
          );
        }


        if (
          !playerPosition
        ) {
          track.lastDistance = null;

          track.lastGain = 1;


          return clamp01(
            definition.baseVolume *
              roomsMasterVolume
          );
        }


        const distance =
          playerPosition.distanceTo(
            definition.position
          );


        const distanceGain =
          getDistanceGain(
            distance,
            definition
          );


        track.lastDistance =
          distance;


        track.lastGain =
          distanceGain;


        return clamp01(
          definition.baseVolume *
            roomsMasterVolume *
            distanceGain
        );
      },


    /* ========================================================
       UPDATE VOLUMES
    ======================================================== */

    updateVolumes:
      function (
        force
      ) {
        const playerPosition =
          this.getPlayerPosition();


        this.tracks.forEach(
          (track) => {
            const targetVolume =
              this.calculateTrackVolume(
                track,
                playerPosition
              );


            const audio =
              track.audio;


            if (!audio) {
              return;
            }


            if (
              force ||
              Math.abs(
                audio.volume -
                  targetVolume
              ) >
                0.006
            ) {
              audio.volume =
                targetVolume;
            }
          }
        );
      },


    /* ========================================================
       PLAY TRACK
    ======================================================== */

    playTrack:
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


        const track =
          this.getTrack(
            id
          );


        if (
          !track ||
          !track.audio
        ) {
          return false;
        }


        const audio =
          track.audio;


        if (
          !audio.paused
        ) {
          return true;
        }


        try {
          const promise =
            audio.play();


          if (
            promise &&
            promise.catch
          ) {
            promise.catch(
              (error) => {
                console.warn(
                  `Could not start ${id}:`,
                  error
                );
              }
            );
          }


          return true;
        }

        catch (error) {
          console.warn(
            `Could not start ${id}:`,
            error
          );


          return false;
        }
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


        const track =
          this.getTrack(
            id
          );


        if (
          !track ||
          !track.audio
        ) {
          return false;
        }


        this.updateVolumes(
          true
        );


        const audio =
          track.audio;


        try {
          audio.pause();

          audio.currentTime =
            0;


          const promise =
            audio.play();


          if (
            promise &&
            promise.catch
          ) {
            promise.catch(
              (error) => {
                console.warn(
                  `Could not play ${id}:`,
                  error
                );
              }
            );
          }


          return true;
        }

        catch (error) {
          console.warn(
            `Could not play ${id}:`,
            error
          );


          return false;
        }
      },


    /* ========================================================
       STOP TRACK
    ======================================================== */

    stopTrack:
      function (
        id
      ) {
        this.desiredPlaying.delete(
          id
        );


        const track =
          this.getTrack(
            id
          );


        if (
          !track ||
          !track.audio
        ) {
          return;
        }


        track.audio.pause();

        track.audio.currentTime =
          0;
      },


    /* ========================================================
       PAUSE TRACK WITHOUT REMOVING INTENT
    ======================================================== */

    pauseTrackWithoutChangingIntent:
      function (
        id
      ) {
        const track =
          this.getTrack(
            id
          );


        if (
          !track ||
          !track.audio
        ) {
          return;
        }


        track.audio.pause();
      },


    /* ========================================================
       NORMAL AMBIENCE
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
       PAUSE EVERYTHING
    ======================================================== */

    pauseAllWithoutChangingIntent:
      function () {
        this.tracks.forEach(
          (
            track,
            id
          ) => {
            this.pauseTrackWithoutChangingIntent(
              id
            );
          }
        );
      },


    /* ========================================================
       SET SOUND POSITION
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


        if (
          !definition ||
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


        this.updateVolumes(
          true
        );
      },


    /* ========================================================
       APPLY PLAYBACK STATE
    ======================================================== */

    applyPlaybackState:
      function () {
        this.updateVolumes(
          true
        );


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
        }

        else {
          this.desiredPlaying.delete(
            'tvStaticSound'
          );


          const tvTrack =
            this.getTrack(
              'tvStaticSound'
            );


          if (
            tvTrack &&
            tvTrack.audio
          ) {
            tvTrack.audio.pause();

            tvTrack.audio.currentTime =
              0;
          }
        }


        this.desiredPlaying.forEach(
          (id) => {
            this.playTrack(
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
       ENTER VR AUDIO RECOVERY
    ======================================================== */

    onEnterVR:
      function () {
        ensureRoomsAudioUnlocked(
          'enter-vr'
        );


        window.setTimeout(
          () => {
            if (
              !roomsAudioUnlocked
            ) {
              ensureRoomsAudioUnlocked(
                'enter-vr-80ms'
              );
            }
          },
          80
        );


        window.setTimeout(
          () => {
            if (
              !roomsAudioUnlocked
            ) {
              ensureRoomsAudioUnlocked(
                'enter-vr-300ms'
              );
            }
          },
          300
        );
      },


    /* ========================================================
       QUEST CONTROLLER RECOVERY
    ======================================================== */

    onControllerGesture:
      function () {
        if (
          !roomsAudioUnlocked
        ) {
          ensureRoomsAudioUnlocked(
            'quest-controller'
          );
        }
      },


    /* ========================================================
       ATTACH QUEST RECOVERY EVENTS
    ======================================================== */

    attachQuestRecoveryListeners:
      function () {
        const targets = [
          document.querySelector(
            '#leftHand'
          ),

          document.querySelector(
            '#rightHand'
          )
        ]
          .filter(
            Boolean
          );


        targets.forEach(
          (target) => {
            if (
              this.recoveryTargets.includes(
                target
              )
            ) {
              return;
            }


            this.recoveryTargets.push(
              target
            );


            this.recoveryEvents.forEach(
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
       UPDATE
    ======================================================== */

    tick:
      function (
        time
      ) {
        if (
          time -
            this.lastDistanceUpdate <
          125
        ) {
          return;
        }


        this.lastDistanceUpdate =
          time;


        this.updateVolumes(
          false
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


        this.recoveryTargets.forEach(
          (target) => {
            this.recoveryEvents.forEach(
              (eventName) => {
                target.removeEventListener(
                  eventName,
                  this.onControllerGesture
                );
              }
            );
          }
        );


        this.recoveryTargets =
          [];


        this.tracks.forEach(
          (track) => {
            if (
              !track.audio
            ) {
              return;
            }


            track.audio.pause();


            track.audio.removeAttribute(
              'src'
            );


            track.audio.load();


            if (
              track.audio.parentNode
            ) {
              track.audio.parentNode.removeChild(
                track.audio
              );
            }
          }
        );


        this.tracks.clear();


        this.desiredPlaying.clear();
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
   RESUME WEB AUDIO CONTEXT

   A-Frame may create a Web Audio context for some project sounds.
   Resume it as part of the same Quest audio recovery process.
============================================================ */

async function resumeRoomsWebAudioContext() {
  let context =
    null;


  try {
    if (
      typeof THREE !==
        'undefined' &&
      THREE.AudioContext &&
      THREE.AudioContext.getContext
    ) {
      context =
        THREE.AudioContext.getContext();
    }
  }

  catch (error) {
    context =
      null;
  }


  if (!context) {
    const scene =
      getScene();


    if (
      scene &&
      scene.audioListener &&
      scene.audioListener.context
    ) {
      context =
        scene.audioListener.context;
    }
  }


  if (
    context &&
    context.state ===
      'suspended'
  ) {
    try {
      await context.resume();
    }

    catch (error) {
      console.warn(
        'Rooms Within Web Audio context could not resume:',
        error
      );
    }
  }


  return Boolean(
    !context ||
    context.state ===
      'running'
  );
}


/* ============================================================
   UNLOCK ONE NATIVE AUDIO ELEMENT
============================================================ */

function unlockAudioElement(
  audio
) {
  if (!audio) {
    return Promise.resolve(
      false
    );
  }


  const previousVolume =
    audio.volume;


  audio.volume =
    0;


  try {
    const promise =
      audio.play();


    if (
      promise &&
      promise.then
    ) {
      return promise
        .then(
          () => {
            audio.pause();

            audio.currentTime =
              0;

            audio.volume =
              previousVolume;


            return true;
          }
        )
        .catch(
          () => {
            audio.pause();

            audio.currentTime =
              0;

            audio.volume =
              previousVolume;


            return false;
          }
        );
    }


    audio.pause();

    audio.currentTime =
      0;

    audio.volume =
      previousVolume;


    return Promise.resolve(
      true
    );
  }

  catch (error) {
    audio.pause();

    audio.currentTime =
      0;

    audio.volume =
      previousVolume;


    return Promise.resolve(
      false
    );
  }
}


/* ============================================================
   SOUND BUTTON UI
============================================================ */

function setRoomsSoundButtonStarting() {
  const button =
    document.querySelector(
      '#soundButton'
    );


  if (!button) {
    return;
  }


  button.textContent =
    'STARTING SOUND...';


  button.disabled =
    true;
}


function setRoomsSoundButtonReady() {
  const button =
    document.querySelector(
      '#soundButton'
    );


  if (!button) {
    return;
  }


  button.textContent =
    'SOUND ENABLED';


  button.disabled =
    true;


  window.setTimeout(
    () => {
      button.style.display =
        'none';
    },
    600
  );
}


function setRoomsSoundButtonRetry() {
  const button =
    document.querySelector(
      '#soundButton'
    );


  if (!button) {
    return;
  }


  button.textContent =
    'ENABLE SOUND';


  button.disabled =
    false;
}


/* ============================================================
   CENTRAL AUDIO UNLOCK

   Used by:
   - ENABLE SOUND
   - ENTER VR
   - Quest controller input
   - VR SOUND button
============================================================ */

async function unlockRoomsAudioNow(
  source,
  showDesktopButtonState
) {
  const scene =
    getScene();


  if (!scene) {
    return false;
  }


  const manager =
    getSpatialAudioManager();


  if (!manager) {
    if (
      showDesktopButtonState
    ) {
      setRoomsSoundButtonRetry();
    }


    return false;
  }


  if (
    !manager.created
  ) {
    manager.createTracks();
  }


  if (
    showDesktopButtonState
  ) {
    setRoomsSoundButtonStarting();
  }


  await resumeRoomsWebAudioContext();


  const unlockPromises =
    [];


  manager.tracks.forEach(
    (track) => {
      if (
        track.audio
      ) {
        unlockPromises.push(
          unlockAudioElement(
            track.audio
          )
        );
      }
    }
  );


  const footstep =
    document.querySelector(
      '#footstepAudio'
    );


  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );


  if (
    footstep
  ) {
    unlockPromises.push(
      unlockAudioElement(
        footstep
      )
    );
  }


  if (
    scareFootstep
  ) {
    unlockPromises.push(
      unlockAudioElement(
        scareFootstep
      )
    );
  }


  const results =
    await Promise.allSettled(
      unlockPromises
    );


  const successCount =
    results.filter(
      (result) =>
        result.status ===
          'fulfilled' &&
        result.value ===
          true
    ).length;


  const success =
    successCount > 0 ||
    unlockPromises.length ===
      0;


  roomsLastUnlockSource =
    String(
      source ||
      'unknown'
    );


  roomsLastUnlockSuccess =
    success;


  if (
    !success
  ) {
    roomsAudioUnlocked =
      false;


    scene.audioUnlocked =
      false;


    if (
      showDesktopButtonState
    ) {
      setRoomsSoundButtonRetry();
    }


    console.warn(
      `Rooms Within audio unlock was blocked (${roomsLastUnlockSource}). The next Quest controller press will try again.`
    );


    return false;
  }


  roomsAudioUnlocked =
    true;


  scene.audioUnlocked =
    true;


  if (
    footstep
  ) {
    footstep.loop =
      true;


    footstep.volume =
      getPlayerFootstepVolume();
  }


  if (
    scareFootstep
  ) {
    scareFootstep.volume =
      getScareFootstepVolume();
  }


  manager.playNormalAmbience();


  manager.applyPlaybackState();


  updateRoomsVolumeUI();


  scene.emit(
    'audio-settings-changed',
    getRoomsAudioState(),
    false
  );


  setRoomsSoundButtonReady();


  console.log(
    `Rooms Within audio unlocked from ${roomsLastUnlockSource}. ${successCount} audio element(s) accepted playback.`
  );


  return true;
}


/* ============================================================
   ENSURE SOUND IS UNLOCKED
============================================================ */

function ensureRoomsAudioUnlocked(
  source,
  showDesktopButtonState =
    false
) {
  if (
    roomsAudioUnlocked
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
    roomsAudioUnlockInProgress
  ) {
    return (
      roomsAudioUnlockInProgress
    );
  }


  roomsAudioUnlockInProgress =
    unlockRoomsAudioNow(
      source,
      showDesktopButtonState
    )
      .finally(
        () => {
          roomsAudioUnlockInProgress =
            null;
        }
      );


  return (
    roomsAudioUnlockInProgress
  );
}


/* ============================================================
   ENABLE SOUND BUTTON
============================================================ */

async function enableSound() {
  return ensureRoomsAudioUnlocked(
    'enable-sound-button',
    true
  );
}


/* ============================================================
   STANDALONE TV STATE
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


  if (!manager) {
    return;
  }


  if (
    roomsTVOn
  ) {
    manager.desiredPlaying.add(
      'tvStaticSound'
    );
  }

  else {
    manager.desiredPlaying.delete(
      'tvStaticSound'
    );


    const track =
      manager.getTrack(
        'tvStaticSound'
      );


    if (
      track &&
      track.audio
    ) {
      track.audio.pause();

      track.audio.currentTime =
        0;
    }
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
    250
  ) {
    return false;
  }


  if (
    roomsMuted ||
    isRoomsPauseMenuOpen() ||
    !roomsAudioUnlocked
  ) {
    return false;
  }


  const manager =
    getSpatialAudioManager();


  if (!manager) {
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

   If the user never enabled audio before entering VR, pressing
   SOUND acts as an audio-recovery gesture rather than immediately
   muting the already-silent experience.
============================================================ */

function toggleRoomsMute() {
  if (
    !roomsAudioUnlocked
  ) {
    roomsMuted =
      false;


    window.roomsMuted =
      false;


    updateRoomsVolumeUI();


    ensureRoomsAudioUnlocked(
      'sound-toggle'
    )
      .then(
        () => {
          applyRoomsAudioSettings();
        }
      );


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
  return {
    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    unlocked:
      roomsAudioUnlocked,

    lastUnlockSource:
      roomsLastUnlockSource,

    lastUnlockSuccess:
      roomsLastUnlockSuccess
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
    manager.applyPlaybackState();
  }


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
      isRoomsPauseMenuOpen() ||
      !roomsAudioUnlocked
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
      isRoomsPauseMenuOpen() ||
      !roomsAudioUnlocked
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
   PLAYER FOOTSTEPS
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


    init: function () {
      this.audio =
        document.querySelector(
          '#footstepAudio'
        );


      this.previousWorldPosition =
        new THREE.Vector3();


      this.currentWorldPosition =
        new THREE.Vector3();


      this.hasPreviousPosition =
        false;


      this.isPlaying =
        false;


      if (
        this.audio
      ) {
        this.audio.loop =
          true;


        this.audio.playsInline =
          true;


        this.audio.setAttribute(
          'playsinline',
          ''
        );


        this.audio.volume =
          getPlayerFootstepVolume();
      }
    },


    stopSteps:
      function () {
        if (
          !this.audio
        ) {
          return;
        }


        this.audio.pause();


        this.audio.currentTime =
          0;


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
          !deltaTime ||
          !this.audio
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


        this.el.object3D
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


        this.audio.volume =
          roomsMuted
            ? 0
            : this.data.volume *
              roomsMasterVolume;


        if (
          isWalking &&
          !this.isPlaying
        ) {
          try {
            const playPromise =
              this.audio.play();


            this.isPlaying =
              true;


            if (
              playPromise &&
              playPromise.catch
            ) {
              playPromise.catch(
                (error) => {
                  this.isPlaying =
                    false;


                  console.warn(
                    'Footstep sound could not start:',
                    error
                  );
                }
              );
            }
          }

          catch (error) {
            this.isPlaying =
              false;
          }
        }

        else if (
          !isWalking &&
          this.isPlaying
        ) {
          this.stopSteps();
        }


        this.previousWorldPosition
          .copy(
            this.currentWorldPosition
          );
      }
  }
);


/* ============================================================
   EXTRA USER-GESTURE RECOVERY

   This means pressing A-Frame's ENTER VR button itself can also
   unlock the audio because pointerdown is a real browser gesture.
============================================================ */

function setupRoomsAudioGestureRecovery() {
  const attempt = () => {
    if (
      !roomsAudioUnlocked
    ) {
      ensureRoomsAudioUnlocked(
        'page-user-gesture'
      );
    }
  };


  window.addEventListener(
    'pointerdown',
    attempt,
    {
      passive: true
    }
  );


  window.addEventListener(
    'touchstart',
    attempt,
    {
      passive: true
    }
  );


  window.addEventListener(
    'keydown',
    attempt
  );
}


/* ============================================================
   DEBUG AUDIO STATE

   Browser console:

   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {
  const manager =
    getSpatialAudioManager();


  const tracks =
    [];


  if (
    manager
  ) {
    manager.tracks.forEach(
      (
        track,
        id
      ) => {
        tracks.push({
          id,

          src:
            track.definition.src,

          paused:
            track.audio.paused,

          volume:
            Number(
              track.audio.volume
                .toFixed(
                  3
                )
            ),

          distance:
            Number.isFinite(
              track.lastDistance
            )
              ? Number(
                  track.lastDistance
                    .toFixed(
                      2
                    )
                )
              : null,

          distanceGain:
            Number(
              track.lastGain
                .toFixed(
                  3
                )
            )
        });
      }
    );
  }


  const scene =
    getScene();


  return {
    unlocked:
      roomsAudioUnlocked,

    unlockInProgress:
      Boolean(
        roomsAudioUnlockInProgress
      ),

    lastUnlockSource:
      roomsLastUnlockSource,

    lastUnlockSuccess:
      roomsLastUnlockSuccess,

    immersiveXR:
      hasRoomsImmersiveXRSession(
        scene
      ),

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

    paused:
      isRoomsPauseMenuOpen(),

    tracks
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