/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — QUEST DIRECTIONAL AUDIO

   WHAT THIS VERSION DOES
   - Normal webpage stays silent.
   - Pressing ENTER VR starts ambience.
   - SOUND: ON / SOUND: OFF toggles immediately.
   - Fan, rain, fluorescent hum, and TV static fade with distance.
   - Those room sounds ALSO pan left/right when you turn your head.
   - A subtle spiral ambience moves left <-> right by itself.
   - TV position can be updated from the real #tv model.
   - Thunder stays centered/global.
   - Footsteps stay centered on the player.
   - Native HTMLAudioElement playback remains the fallback if
     Web Audio stereo panning is unavailable on the browser.
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
let roomsVRStarted = false;
let roomsLastUnlockSource = 'none';
let roomsLastUnlockSuccess = false;
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
   DIRECTIONAL AUDIO / SPIRAL SETTINGS
============================================================ */

const ROOMS_MAX_STEREO_PAN = 0.92;
const ROOMS_SPATIAL_UPDATE_MS = 33;
const ROOMS_DISTANCE_UPDATE_MS = 125;

const ROOMS_SPIRAL_BASE_VOLUME = 0.035;
const ROOMS_SPIRAL_CYCLE_SECONDS = 8.0;


/* ============================================================
   WEB AUDIO STATE

   IMPORTANT:
   Room sounds begin as normal native HTML audio.

   Only AFTER Web Audio successfully resumes do we attach the
   native tracks to StereoPannerNodes. If Web Audio cannot run,
   the project simply keeps the native centered sound instead of
   losing all sound.
============================================================ */

const roomsDirectionalAudio = {
  context: null,
  available: null,
  connecting: false,
  connected: false,
  lastError: null
};

const roomsSpiral = {
  source: null,
  filter: null,
  panner: null,
  gain: null,
  started: false,
  startTime: 0
};


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


function clampPan(value) {
  return Math.max(
    -1,
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
  return document.querySelector('a-scene');
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
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

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


function shouldRoomsAudioBeAudible() {
  return Boolean(
    roomsVRStarted &&
    roomsAudioUnlocked &&
    !roomsMuted &&
    !isRoomsPauseMenuOpen()
  );
}


function getPlayerFootstepVolume() {
  if (
    roomsMuted ||
    !roomsVRStarted
  ) {
    return 0;
  }

  return 0.11 * roomsMasterVolume;
}


function getScareFootstepVolume() {
  if (
    roomsMuted ||
    !roomsVRStarted
  ) {
    return 0;
  }

  return 0.30 * roomsMasterVolume;
}


/* ============================================================
   DISTANCE FADING
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
   HEAD-TURN STEREO PAN

   We calculate where the sound is relative to the HEADSET:

   sound on left  -> negative pan
   sound in front -> approximately 0
   sound on right -> positive pan

   Turning your head changes the headset's right vector, therefore
   the same fixed sound moves between the left and right ears.
============================================================ */

function calculateHeadRelativePan(
  listenerPosition,
  listenerQuaternion,
  sourcePosition
) {
  if (
    !listenerPosition ||
    !listenerQuaternion ||
    !sourcePosition
  ) {
    return 0;
  }

  const toSource =
    new THREE.Vector3()
      .subVectors(
        sourcePosition,
        listenerPosition
      );

  /*
    Stereo left/right should mainly follow yaw.
    Ignore height so looking up/down does not make a room sound
    jump strangely between ears.
  */
  toSource.y = 0;

  if (toSource.lengthSq() < 0.000001) {
    return 0;
  }

  toSource.normalize();

  const headsetRight =
    new THREE.Vector3(1, 0, 0)
      .applyQuaternion(
        listenerQuaternion
      );

  headsetRight.y = 0;

  if (
    headsetRight.lengthSq() <
    0.000001
  ) {
    return 0;
  }

  headsetRight.normalize();

  return clampPan(
    toSource.dot(headsetRight) *
    ROOMS_MAX_STEREO_PAN
  );
}


/* ============================================================
   CREATE SPIRAL NOISE BUFFER
============================================================ */

function createRoomsSpiralBuffer(context) {
  const duration = 2;

  const frameCount = Math.max(
    1,
    Math.floor(
      context.sampleRate * duration
    )
  );

  const buffer = context.createBuffer(
    1,
    frameCount,
    context.sampleRate
  );

  const data = buffer.getChannelData(0);

  let previous = 0;

  for (
    let index = 0;
    index < frameCount;
    index += 1
  ) {
    const random =
      Math.random() * 2 - 1;

    previous =
      previous * 0.92 +
      random * 0.08;

    data[index] = previous;
  }

  return buffer;
}


/* ============================================================
   NATIVE + DIRECTIONAL AUDIO MANAGER
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init: function () {
      this.tracks = new Map();
      this.desiredPlaying = new Set();
      this.created = false;

      this.lastDistanceUpdate = 0;
      this.lastSpatialUpdate = 0;

      this.playerWorldPosition =
        new THREE.Vector3();

      this.playerWorldQuaternion =
        new THREE.Quaternion();

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
        this.createTracks.bind(this);

      this.onPauseChanged =
        this.onPauseChanged.bind(this);

      this.onEnterVR =
        this.onEnterVR.bind(this);

      this.onExitVR =
        this.onExitVR.bind(this);

      this.onControllerGesture =
        this.onControllerGesture.bind(this);

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

      this.el.addEventListener(
        'exit-vr',
        this.onExitVR
      );

      if (this.el.hasLoaded) {
        this.createTracks();
        this.attachQuestRecoveryListeners();
      } else {
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


    createTracks: function () {
      if (this.created) {
        return;
      }

      this.created = true;

      ROOM_SOUND_DEFINITIONS.forEach(
        (definition) => {
          const audio =
            document.createElement('audio');

          audio.id =
            `rooms-${definition.id}`;

          audio.src = definition.src;
          audio.preload = 'auto';

          audio.loop = Boolean(
            definition.loop
          );
          audio.playsInline = true;
          audio.volume = 0;

          audio.setAttribute(
            'playsinline',
            ''
          );

          audio.setAttribute(
            'webkit-playsinline',
            ''
          );

          audio.style.display = 'none';

          audio.addEventListener(
            'error',
            () => {
              const code =
                audio.error
                  ? audio.error.code
                  : 'unknown';

              console.error(
                `Audio failed to load: ${definition.src} (code ${code})`
              );
            }
          );

          document.body.appendChild(audio);

          this.tracks.set(
            definition.id,
            {
              definition,
              audio,
              mediaSource: null,
              gainNode: null,
              panNode: null,
              directionalConnected: false,
              lastDistance: Infinity,
              lastGain: 0,
              lastPan: 0,
              targetVolume: 0,
              lastPlaySucceeded: false,
              lastPlayError: null
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

      if (roomsTVWorldPosition) {
        this.setEmitterPosition(
          'tvStaticSound',
          roomsTVWorldPosition
        );
      }

      this.updateVolumes(true);
    },


    getTrack: function (id) {
      return (
        this.tracks.get(id) ||
        null
      );
    },


    getPlayerTransform: function () {
      const camera = getCameraEntity();

      if (!camera || !camera.object3D) {
        return false;
      }

      camera.object3D.getWorldPosition(
        this.playerWorldPosition
      );

      camera.object3D.getWorldQuaternion(
        this.playerWorldQuaternion
      );

      return true;
    },


    calculateTrackVolume: function (
      track
    ) {
      if (
        !track ||
        !track.definition ||
        roomsMuted ||
        !roomsVRStarted ||
        isRoomsPauseMenuOpen()
      ) {
        return 0;
      }

      const definition =
        track.definition;

      if (definition.global) {
        track.lastDistance = 0;
        track.lastGain = 1;

        return clamp01(
          definition.baseVolume *
          roomsMasterVolume
        );
      }

      const distance =
        this.playerWorldPosition
          .distanceTo(
            definition.position
          );

      const distanceGain =
        getDistanceGain(
          distance,
          definition
        );

      track.lastDistance = distance;
      track.lastGain = distanceGain;

      return clamp01(
        definition.baseVolume *
        roomsMasterVolume *
        distanceGain
      );
    },


    setTrackOutputVolume: function (
      track,
      targetVolume,
      force = false
    ) {
      if (!track || !track.audio) {
        return;
      }

      track.targetVolume =
        clamp01(targetVolume);

      if (
        track.directionalConnected &&
        track.gainNode &&
        roomsDirectionalAudio.context
      ) {
        /*
          Once a media element is routed through Web Audio,
          leave the HTML element itself at full volume and control
          loudness using the GainNode.
        */
        track.audio.volume = 1;

        const current =
          track.gainNode.gain.value;

        if (
          force ||
          Math.abs(
            current -
            track.targetVolume
          ) > 0.004
        ) {
          try {
            track.gainNode.gain
              .setTargetAtTime(
                track.targetVolume,
                roomsDirectionalAudio.context.currentTime,
                0.04
              );
          } catch (error) {
            track.gainNode.gain.value =
              track.targetVolume;
          }
        }

        return;
      }

      if (
        force ||
        Math.abs(
          track.audio.volume -
          track.targetVolume
        ) > 0.006
      ) {
        track.audio.volume =
          track.targetVolume;
      }
    },


    updateVolumes: function (force) {
      this.getPlayerTransform();

      this.tracks.forEach(
        (track) => {
          const targetVolume =
            this.calculateTrackVolume(
              track
            );

          this.setTrackOutputVolume(
            track,
            targetVolume,
            force
          );
        }
      );

      this.updateSpiralVolume();
    },


    updateDirectionalPans: function () {
      if (
        !roomsDirectionalAudio.connected ||
        !roomsDirectionalAudio.context
      ) {
        return;
      }

      if (!this.getPlayerTransform()) {
        return;
      }

      this.tracks.forEach(
        (track) => {
          if (
            !track ||
            !track.panNode ||
            !track.directionalConnected
          ) {
            return;
          }

          const definition =
            track.definition;

          if (
            !definition ||
            definition.global
          ) {
            track.lastPan = 0;

            try {
              track.panNode.pan
                .setTargetAtTime(
                  0,
                  roomsDirectionalAudio.context.currentTime,
                  0.035
                );
            } catch (error) {
              track.panNode.pan.value = 0;
            }

            return;
          }

          const pan =
            calculateHeadRelativePan(
              this.playerWorldPosition,
              this.playerWorldQuaternion,
              definition.position
            );

          track.lastPan = pan;

          try {
            track.panNode.pan
              .setTargetAtTime(
                pan,
                roomsDirectionalAudio.context.currentTime,
                0.035
              );
          } catch (error) {
            track.panNode.pan.value = pan;
          }
        }
      );

      this.updateSpiralPan();
    },


    connectDirectionalNodes: function () {
      const context =
        roomsDirectionalAudio.context;

      if (
        !context ||
        context.state !== 'running' ||
        typeof context.createMediaElementSource !== 'function' ||
        typeof context.createStereoPanner !== 'function'
      ) {
        return false;
      }

      let connectedCount = 0;

      this.tracks.forEach(
        (track) => {
          if (
            !track ||
            !track.audio ||
            track.directionalConnected
          ) {
            if (
              track &&
              track.directionalConnected
            ) {
              connectedCount += 1;
            }

            return;
          }

          let mediaSource = null;
          let gainNode = null;
          let panNode = null;

          try {
            mediaSource =
              context.createMediaElementSource(
                track.audio
              );

            gainNode =
              context.createGain();

            mediaSource.connect(gainNode);

            if (!track.definition.global) {
              panNode =
                context.createStereoPanner();

              gainNode.connect(panNode);
              panNode.connect(
                context.destination
              );
            } else {
              /* Thunder remains centered. */
              gainNode.connect(
                context.destination
              );
            }

            track.mediaSource = mediaSource;
            track.gainNode = gainNode;
            track.panNode = panNode;
            track.directionalConnected = true;

            track.audio.volume = 1;
            gainNode.gain.value =
              track.targetVolume;

            connectedCount += 1;
          } catch (error) {
            track.lastPlayError =
              `directional graph: ${error.message || error}`;

            /*
              If MediaElementSource was already created before a
              later node failed, connect it directly so the track
              still has output instead of becoming silent.
            */
            try {
              if (
                mediaSource &&
                gainNode &&
                !track.directionalConnected
              ) {
                gainNode.connect(
                  context.destination
                );

                track.mediaSource = mediaSource;
                track.gainNode = gainNode;
                track.panNode = null;
                track.directionalConnected = true;

                track.audio.volume = 1;
                gainNode.gain.value =
                  track.targetVolume;

                connectedCount += 1;
              }
            } catch (fallbackError) {
              /* Native audio remains the fallback. */
            }

            console.warn(
              `Directional audio could not attach to ${track.definition.id}:`,
              error
            );
          }
        }
      );

      roomsDirectionalAudio.connected =
        connectedCount > 0;

      if (roomsDirectionalAudio.connected) {
        this.ensureSpiral();
        this.updateVolumes(true);
        this.updateDirectionalPans();
      }

      return roomsDirectionalAudio.connected;
    },


    ensureSpiral: function () {
      if (
        roomsSpiral.started ||
        !roomsDirectionalAudio.context ||
        roomsDirectionalAudio.context.state !== 'running' ||
        typeof roomsDirectionalAudio.context.createStereoPanner !==
          'function'
      ) {
        return roomsSpiral.started;
      }

      const context =
        roomsDirectionalAudio.context;

      try {
        const source =
          context.createBufferSource();

        const filter =
          context.createBiquadFilter();

        const panner =
          context.createStereoPanner();

        const gain =
          context.createGain();

        source.buffer =
          createRoomsSpiralBuffer(
            context
          );

        source.loop = true;

        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 0.8;

        panner.pan.value = 0;
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(panner);
        panner.connect(gain);
        gain.connect(
          context.destination
        );

        source.start();

        roomsSpiral.source = source;
        roomsSpiral.filter = filter;
        roomsSpiral.panner = panner;
        roomsSpiral.gain = gain;
        roomsSpiral.started = true;
        roomsSpiral.startTime =
          performance.now();

        this.updateSpiralVolume();
        this.updateSpiralPan();

        return true;
      } catch (error) {
        console.warn(
          'Spiral ambience could not start:',
          error
        );

        return false;
      }
    },


    updateSpiralVolume: function () {
      if (
        !roomsSpiral.started ||
        !roomsSpiral.gain ||
        !roomsDirectionalAudio.context
      ) {
        return;
      }

      const target =
        shouldRoomsAudioBeAudible()
          ? ROOMS_SPIRAL_BASE_VOLUME *
            roomsMasterVolume
          : 0;

      try {
        roomsSpiral.gain.gain
          .setTargetAtTime(
            target,
            roomsDirectionalAudio.context.currentTime,
            0.08
          );
      } catch (error) {
        roomsSpiral.gain.gain.value =
          target;
      }
    },


    updateSpiralPan: function () {
      if (
        !roomsSpiral.started ||
        !roomsSpiral.panner ||
        !roomsSpiral.filter ||
        !roomsDirectionalAudio.context
      ) {
        return;
      }

      const elapsedSeconds =
        (
          performance.now() -
          roomsSpiral.startTime
        ) /
        1000;

      const phase =
        elapsedSeconds /
        ROOMS_SPIRAL_CYCLE_SECONDS *
        Math.PI *
        2;

      const pan = Math.sin(phase);

      const filterFrequency =
        430 +
        180 *
        (
          0.5 +
          0.5 *
          Math.sin(
            phase * 0.5 +
            Math.PI * 0.35
          )
        );

      try {
        roomsSpiral.panner.pan
          .setTargetAtTime(
            pan,
            roomsDirectionalAudio.context.currentTime,
            0.08
          );

        roomsSpiral.filter.frequency
          .setTargetAtTime(
            filterFrequency,
            roomsDirectionalAudio.context.currentTime,
            0.15
          );
      } catch (error) {
        roomsSpiral.panner.pan.value = pan;
        roomsSpiral.filter.frequency.value =
          filterFrequency;
      }
    },


    playTrack: function (id) {
      this.desiredPlaying.add(id);

      if (
        !shouldRoomsAudioBeAudible()
      ) {
        return false;
      }

      const track = this.getTrack(id);

      if (
        !track ||
        !track.audio
      ) {
        return false;
      }

      if (!track.audio.paused) {
        return true;
      }

      try {
        const promise =
          track.audio.play();

        if (
          promise &&
          promise.then
        ) {
          promise
            .then(
              () => {
                track.lastPlaySucceeded = true;
                track.lastPlayError = null;
                roomsAudioUnlocked = true;
                roomsLastUnlockSuccess = true;
              }
            )
            .catch(
              (error) => {
                track.lastPlaySucceeded = false;
                track.lastPlayError =
                  error.name ||
                  error.message ||
                  String(error);

                console.warn(
                  `Could not start ${id}:`,
                  error
                );
              }
            );
        }

        return true;
      } catch (error) {
        track.lastPlaySucceeded = false;
        track.lastPlayError =
          error.name ||
          error.message ||
          String(error);

        return false;
      }
    },


    playOneShot: function (id) {
      if (!shouldRoomsAudioBeAudible()) {
        return false;
      }

      const track = this.getTrack(id);

      if (
        !track ||
        !track.audio
      ) {
        return false;
      }

      this.updateVolumes(true);

      try {
        track.audio.pause();
        track.audio.currentTime = 0;

        const promise =
          track.audio.play();

        if (
          promise &&
          promise.catch
        ) {
          promise.catch(
            (error) => {
              track.lastPlayError =
                error.name ||
                error.message ||
                String(error);
            }
          );
        }

        return true;
      } catch (error) {
        track.lastPlayError =
          error.name ||
          error.message ||
          String(error);

        return false;
      }
    },


    stopTrack: function (id) {
      this.desiredPlaying.delete(id);

      const track = this.getTrack(id);

      if (
        !track ||
        !track.audio
      ) {
        return;
      }

      track.audio.pause();

      try {
        track.audio.currentTime = 0;
      } catch (error) {
        /* ignore seek error */
      }
    },


    pauseTrackWithoutChangingIntent:
      function (id) {
        const track = this.getTrack(id);

        if (
          track &&
          track.audio
        ) {
          track.audio.pause();
        }
      },


    pauseAllWithoutChangingIntent:
      function () {
        this.tracks.forEach(
          (track) => {
            if (
              track &&
              track.audio
            ) {
              track.audio.pause();
            }
          }
        );

        this.updateSpiralVolume();
      },


    pauseAll: function () {
      this.pauseAllWithoutChangingIntent();

      const footstep =
        document.querySelector(
          '#footstepAudio'
        );

      const scareFootstep =
        document.querySelector(
          '#scareFootstepAudio'
        );

      if (footstep) {
        footstep.pause();
      }

      if (scareFootstep) {
        scareFootstep.pause();
      }
    },


    playNormalAmbience: function () {
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


    setEmitterPosition: function (
      id,
      worldPosition
    ) {
      const definition =
        getRoomSoundDefinition(id);

      if (
        !definition ||
        !worldPosition
      ) {
        return;
      }

      definition.position.set(
        Number(worldPosition.x) || 0,
        Number(worldPosition.y) || 0,
        Number(worldPosition.z) || 0
      );

      this.updateVolumes(true);
      this.updateDirectionalPans();
    },


    applyPlaybackState: function () {
      this.updateVolumes(true);
      this.updateDirectionalPans();

      if (!shouldRoomsAudioBeAudible()) {
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

      if (roomsTVOn) {
        this.desiredPlaying.add(
          'tvStaticSound'
        );
      } else {
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

          try {
            tvTrack.audio.currentTime = 0;
          } catch (error) {
            /* ignore seek error */
          }
        }
      }

      this.desiredPlaying.forEach(
        (id) => {
          this.playTrack(id);
        }
      );

      this.updateSpiralVolume();
    },


    onPauseChanged: function () {
      this.applyPlaybackState();
    },


    onEnterVR: function () {
      roomsVRStarted = true;

      /*
        This event is a fallback. The actual A-Frame ENTER VR
        button is hooked directly below so audio starts from the
        original click/pointer gesture whenever possible.
      */
      if (!roomsMuted) {
        ensureRoomsAudioUnlocked(
          'enter-vr-event'
        );
      }
    },


    onExitVR: function () {
      roomsVRStarted = false;
      this.pauseAll();
      this.updateSpiralVolume();
    },


    onControllerGesture: function () {
      const scene = getScene();

      if (
        !roomsVRStarted &&
        !hasRoomsImmersiveXRSession(scene)
      ) {
        return;
      }

      roomsVRStarted = true;

      if (roomsMuted) {
        return;
      }

      /*
        Controller input is a fresh user gesture, so it can recover
        a suspended Web Audio context and/or native playback.
      */
      ensureRoomsAudioUnlocked(
        'quest-controller'
      );
    },


    attachQuestRecoveryListeners:
      function () {
        const targets = [
          document.querySelector(
            '#leftHand'
          ),
          document.querySelector(
            '#rightHand'
          )
        ].filter(Boolean);

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


    tick: function (time) {
      if (
        time -
        this.lastSpatialUpdate >=
        ROOMS_SPATIAL_UPDATE_MS
      ) {
        this.lastSpatialUpdate = time;
        this.updateDirectionalPans();
      }

      if (
        time -
        this.lastDistanceUpdate >=
        ROOMS_DISTANCE_UPDATE_MS
      ) {
        this.lastDistanceUpdate = time;
        this.updateVolumes(false);
      }
    },


    remove: function () {
      this.el.removeEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );

      this.el.removeEventListener(
        'enter-vr',
        this.onEnterVR
      );

      this.el.removeEventListener(
        'exit-vr',
        this.onExitVR
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

      this.recoveryTargets = [];

      this.tracks.forEach(
        (track) => {
          if (!track.audio) {
            return;
          }

          track.audio.pause();

          try {
            if (track.mediaSource) {
              track.mediaSource.disconnect();
            }

            if (track.gainNode) {
              track.gainNode.disconnect();
            }

            if (track.panNode) {
              track.panNode.disconnect();
            }
          } catch (error) {
            /* best effort cleanup */
          }

          track.audio.removeAttribute('src');
          track.audio.load();

          if (track.audio.parentNode) {
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
  const scene = getScene();

  if (!scene) {
    return null;
  }

  return (
    scene.components[
      'spatial-audio-manager'
    ] || null
  );
}


/* ============================================================
   DIRECTIONAL WEB AUDIO ACTIVATION

   Called from ENTER VR or a Quest controller gesture.

   IMPORTANT:
   We do not immediately route the HTMLAudioElements into Web Audio.
   First we ask the AudioContext to run. Only after it reports
   "running" do we attach the StereoPannerNodes.

   If that never succeeds, native centered audio keeps working.
============================================================ */

function activateRoomsDirectionalAudio() {
  const manager =
    getSpatialAudioManager();

  if (!manager) {
    return Promise.resolve(false);
  }

  if (
    roomsDirectionalAudio.connected &&
    roomsDirectionalAudio.context
  ) {
    if (
      roomsDirectionalAudio.context.state ===
      'suspended'
    ) {
      return roomsDirectionalAudio.context
        .resume()
        .then(
          () => {
            manager.updateVolumes(true);
            manager.updateDirectionalPans();
            return true;
          }
        )
        .catch(
          () => false
        );
    }

    return Promise.resolve(true);
  }

  if (roomsDirectionalAudio.connecting) {
    return Promise.resolve(false);
  }

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    roomsDirectionalAudio.available = false;
    return Promise.resolve(false);
  }

  if (
    !AudioContextClass.prototype ||
    typeof AudioContextClass.prototype
      .createStereoPanner !== 'function'
  ) {
    /*
      Some browsers expose createStereoPanner only on the instance,
      so this check is not final. We still try below.
    */
  }

  try {
    if (!roomsDirectionalAudio.context) {
      roomsDirectionalAudio.context =
        new AudioContextClass();
    }
  } catch (error) {
    roomsDirectionalAudio.available = false;
    roomsDirectionalAudio.lastError =
      error.message || String(error);

    return Promise.resolve(false);
  }

  const context =
    roomsDirectionalAudio.context;

  if (
    typeof context.createMediaElementSource !==
      'function' ||
    typeof context.createStereoPanner !==
      'function'
  ) {
    roomsDirectionalAudio.available = false;
    roomsDirectionalAudio.lastError =
      'StereoPannerNode or MediaElementAudioSourceNode unavailable';

    return Promise.resolve(false);
  }

  roomsDirectionalAudio.connecting = true;

  const finishConnection = () => {
    roomsDirectionalAudio.connecting = false;

    if (context.state !== 'running') {
      roomsDirectionalAudio.available = false;
      roomsDirectionalAudio.lastError =
        `AudioContext state: ${context.state}`;

      return false;
    }

    const connected =
      manager.connectDirectionalNodes();

    roomsDirectionalAudio.available =
      connected;

    if (connected) {
      roomsDirectionalAudio.lastError = null;
    }

    return connected;
  };

  if (context.state === 'running') {
    return Promise.resolve(
      finishConnection()
    );
  }

  try {
    return context.resume()
      .then(
        () => finishConnection()
      )
      .catch(
        (error) => {
          roomsDirectionalAudio.connecting = false;
          roomsDirectionalAudio.available = false;
          roomsDirectionalAudio.lastError =
            error.message || String(error);

          /* Native sound remains untouched. */
          return false;
        }
      );
  } catch (error) {
    roomsDirectionalAudio.connecting = false;
    roomsDirectionalAudio.available = false;
    roomsDirectionalAudio.lastError =
      error.message || String(error);

    return Promise.resolve(false);
  }
}


/* ============================================================
   UNLOCK / START AUDIO FROM A REAL USER GESTURE
============================================================ */

function primeRoomsFootstepAudio() {
  const elements = [
    document.querySelector(
      '#footstepAudio'
    ),
    document.querySelector(
      '#scareFootstepAudio'
    )
  ].filter(Boolean);

  elements.forEach(
    (audio) => {
      const oldMuted = audio.muted;
      const oldVolume = audio.volume;

      audio.muted = true;
      audio.volume = 0;

      try {
        const promise = audio.play();

        if (
          promise &&
          promise.then
        ) {
          promise
            .then(
              () => {
                audio.pause();

                try {
                  audio.currentTime = 0;
                } catch (error) {
                  /* ignore seek error */
                }

                audio.muted = oldMuted;
                audio.volume = oldVolume;
              }
            )
            .catch(
              () => {
                audio.muted = oldMuted;
                audio.volume = oldVolume;
              }
            );
        }
      } catch (error) {
        audio.muted = oldMuted;
        audio.volume = oldVolume;
      }
    }
  );
}


function startRoomsAudioFromGesture(source) {
  const manager =
    getSpatialAudioManager();

  const scene = getScene();

  roomsLastUnlockSource =
    String(source || 'user-gesture');

  /*
    This function is only called from ENTER VR or controller-based
    recovery in normal use, so it is safe to mark VR audio started.
  */
  roomsVRStarted = true;

  if (!manager) {
    return Promise.resolve(false);
  }

  manager.createTracks();
  manager.updateVolumes(true);

  /*
    Ask Web Audio to become available, but do not depend on it.
    Native audio starts immediately below.
  */
  activateRoomsDirectionalAudio();

  primeRoomsFootstepAudio();

  if (roomsMuted) {
    manager.pauseAllWithoutChangingIntent();
    updateRoomsVolumeUI();

    return Promise.resolve(false);
  }

  const paused =
    isRoomsPauseMenuOpen();

  const playPromises = [];

  manager.tracks.forEach(
    (track, id) => {
      const shouldPrime =
        track.definition.startAutomatically ||
        (
          id === 'tvStaticSound' &&
          roomsTVOn
        );

      if (!shouldPrime) {
        return;
      }

      if (paused) {
        /*
          Settings is open. Use the controller press to unlock the
          element silently, then pause it. Resume will restore it.
        */
        const previousVolume =
          track.audio.volume;

        track.audio.volume = 0;

        try {
          const promise =
            track.audio.play();

          if (
            promise &&
            promise.then
          ) {
            playPromises.push(
              promise
                .then(
                  () => {
                    track.audio.pause();
                    track.audio.volume =
                      previousVolume;

                    track.lastPlaySucceeded = true;
                    track.lastPlayError = null;
                    return true;
                  }
                )
                .catch(
                  (error) => {
                    track.audio.pause();
                    track.audio.volume =
                      previousVolume;

                    track.lastPlaySucceeded = false;
                    track.lastPlayError =
                      error.name ||
                      error.message ||
                      String(error);

                    return false;
                  }
                )
            );
          }
        } catch (error) {
          track.audio.volume =
            previousVolume;
        }

        return;
      }

      try {
        const promise =
          track.audio.play();

        if (
          promise &&
          promise.then
        ) {
          playPromises.push(
            promise
              .then(
                () => {
                  track.lastPlaySucceeded = true;
                  track.lastPlayError = null;
                  return true;
                }
              )
              .catch(
                (error) => {
                  track.lastPlaySucceeded = false;
                  track.lastPlayError =
                    error.name ||
                    error.message ||
                    String(error);

                  return false;
                }
              )
          );
        }
      } catch (error) {
        track.lastPlaySucceeded = false;
        track.lastPlayError =
          error.name ||
          error.message ||
          String(error);
      }
    }
  );

  const finish = (success) => {
    if (success) {
      roomsAudioUnlocked = true;
      roomsLastUnlockSuccess = true;

      if (scene) {
        scene.audioUnlocked = true;
      }
    }

    manager.updateVolumes(true);
    manager.updateDirectionalPans();

    if (!paused) {
      manager.applyPlaybackState();
    }

    updateRoomsVolumeUI();

    if (scene) {
      scene.emit(
        'audio-settings-changed',
        getRoomsAudioState(),
        false
      );
    }

    return success;
  };

  if (playPromises.length === 0) {
    /*
      If audio.play() returns no Promise on an older browser, assume
      the direct call was accepted and let playback state continue.
    */
    return Promise.resolve(
      finish(true)
    );
  }

  return Promise.all(playPromises)
    .then(
      (results) =>
        finish(
          results.some(Boolean)
        )
    );
}


function ensureRoomsAudioUnlocked(source) {
  if (
    roomsAudioUnlocked &&
    roomsVRStarted
  ) {
    activateRoomsDirectionalAudio();

    const manager =
      getSpatialAudioManager();

    if (manager) {
      manager.applyPlaybackState();
    }

    return Promise.resolve(true);
  }

  if (roomsAudioUnlockInProgress) {
    return roomsAudioUnlockInProgress;
  }

  roomsAudioUnlockInProgress =
    startRoomsAudioFromGesture(source)
      .finally(
        () => {
          roomsAudioUnlockInProgress = null;
        }
      );

  return roomsAudioUnlockInProgress;
}


/* ============================================================
   DIRECT ENTER VR BUTTON HOOK

   We intentionally do NOT start audio from random page clicks.
   The page stays silent until the user actually presses ENTER VR.
============================================================ */

function attachRoomsEnterVRButtonHook() {
  const button =
    document.querySelector(
      '.a-enter-vr-button'
    );

  if (
    !button ||
    button.dataset.roomsAudioHook === 'true'
  ) {
    return;
  }

  button.dataset.roomsAudioHook = 'true';

  const start = (event) => {
    if (roomsMuted) {
      roomsVRStarted = true;
      return;
    }

    ensureRoomsAudioUnlocked(
      `enter-vr-${event.type}`
    );
  };

  button.addEventListener(
    'pointerdown',
    start,
    true
  );

  button.addEventListener(
    'touchstart',
    start,
    {
      capture: true,
      passive: true
    }
  );

  button.addEventListener(
    'click',
    start,
    true
  );
}


function setupRoomsEnterVRButtonWatcher() {
  attachRoomsEnterVRButtonHook();

  const observer =
    new MutationObserver(
      attachRoomsEnterVRButtonHook
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  window.setTimeout(
    attachRoomsEnterVRButtonHook,
    300
  );

  window.setTimeout(
    attachRoomsEnterVRButtonHook,
    1000
  );
}


/* ============================================================
   LEGACY ENABLE SOUND COMPATIBILITY
============================================================ */

function enableSound() {
  return ensureRoomsAudioUnlocked(
    'legacy-enable-sound'
  );
}


/* ============================================================
   TV STATE / POSITION
============================================================ */

function setRoomsTVState(shouldBeOn) {
  roomsTVOn = Boolean(shouldBeOn);

  const manager =
    getSpatialAudioManager();

  if (!manager) {
    return;
  }

  if (roomsTVOn) {
    manager.desiredPlaying.add(
      'tvStaticSound'
    );
  } else {
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

      try {
        track.audio.currentTime = 0;
      } catch (error) {
        /* ignore seek error */
      }
    }
  }

  manager.applyPlaybackState();
}


function setRoomsTVPosition(worldPosition) {
  if (!worldPosition) {
    return;
  }

  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(worldPosition.x) || 0,
      Number(worldPosition.y) || 0,
      Number(worldPosition.z) || 0
    );

  const manager =
    getSpatialAudioManager();

  if (manager) {
    manager.setEmitterPosition(
      'tvStaticSound',
      roomsTVWorldPosition
    );
  }
}


/* ============================================================
   THUNDER
============================================================ */

function playRoomsThunder() {
  const now = performance.now();

  if (
    now -
    roomsLastThunderTime <
    250
  ) {
    return false;
  }

  if (!shouldRoomsAudioBeAudible()) {
    return false;
  }

  const manager =
    getSpatialAudioManager();

  if (!manager) {
    return false;
  }

  roomsLastThunderTime = now;

  return manager.playOneShot(
    'thunderSound'
  );
}


/* ============================================================
   MASTER VOLUME
============================================================ */

function changeRoomsVolume(amount) {
  roomsMasterVolume = clamp01(
    roomsMasterVolume +
    Number(amount || 0)
  );

  applyRoomsAudioSettings();
}


/* ============================================================
   SOUND ON / OFF

   FIXED BEHAVIOUR:
   Always change the ON/OFF state immediately.
============================================================ */

function toggleRoomsMute() {
  roomsMuted = !roomsMuted;
  window.roomsMuted = roomsMuted;

  updateRoomsVolumeUI();

  const scene = getScene();

  if (scene) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }

  const manager =
    getSpatialAudioManager();

  if (roomsMuted) {
    if (manager) {
      manager.pauseAllWithoutChangingIntent();
      manager.updateVolumes(true);
    }

    return true;
  }

  /*
    SOUND: ON.
    This Settings trigger press is a real controller gesture, so it
    is a good time to recover both native playback and Web Audio.
  */
  if (roomsVRStarted) {
    ensureRoomsAudioUnlocked(
      'settings-sound-on'
    );
  } else if (manager) {
    manager.applyPlaybackState();
  }

  return false;
}


/* ============================================================
   APPLY CURRENT AUDIO SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  const manager =
    getSpatialAudioManager();

  if (manager) {
    manager.applyPlaybackState();
    manager.updateVolumes(true);
    manager.updateDirectionalPans();
  }

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  if (footstep) {
    footstep.volume =
      getPlayerFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen() ||
      !roomsAudioUnlocked ||
      !roomsVRStarted
    ) {
      footstep.pause();
    }
  }

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (scareFootstep) {
    scareFootstep.volume =
      getScareFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen() ||
      !roomsAudioUnlocked ||
      !roomsVRStarted
    ) {
      scareFootstep.pause();
    }
  }

  updateRoomsVolumeUI();

  const scene = getScene();

  if (scene) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }
}


/* ============================================================
   SOUND UI
============================================================ */

function updateRoomsVolumeUI() {
  const percent = Math.round(
    roomsMasterVolume * 100
  );

  const screenVolumeLabel =
    document.querySelector(
      '#screenVolumeLabel'
    );

  if (screenVolumeLabel) {
    screenVolumeLabel.textContent =
      `${percent}%`;
  }

  const vrVolumeLabel =
    document.querySelector(
      '#vrVolumeLabel'
    );

  if (vrVolumeLabel) {
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

  if (screenSoundButton) {
    screenSoundButton.textContent =
      soundText;
  }

  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (vrSoundLabel) {
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
        default: 0.02
      },

      maxSpeed: {
        default: 4
      },

      volume: {
        default: 0.11
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

      this.hasPreviousPosition = false;
      this.isPlaying = false;

      if (this.audio) {
        this.audio.loop = true;
        this.audio.playsInline = true;
        this.audio.setAttribute(
          'playsinline',
          ''
        );
        this.audio.volume =
          getPlayerFootstepVolume();
      }
    },


    stopSteps: function () {
      if (!this.audio) {
        return;
      }

      this.audio.pause();
      this.isPlaying = false;
    },


    pause: function () {
      this.stopSteps();
      this.hasPreviousPosition = false;
    },


    play: function () {
      this.hasPreviousPosition = false;
    },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !deltaTime ||
        !this.audio
      ) {
        return;
      }

      if (!shouldRoomsAudioBeAudible()) {
        if (this.isPlaying) {
          this.stopSteps();
        }

        this.hasPreviousPosition = false;
        return;
      }

      this.el.object3D.getWorldPosition(
        this.currentWorldPosition
      );

      if (!this.hasPreviousPosition) {
        this.previousWorldPosition.copy(
          this.currentWorldPosition
        );

        this.hasPreviousPosition = true;
        return;
      }

      const deltaX =
        this.currentWorldPosition.x -
        this.previousWorldPosition.x;

      const deltaZ =
        this.currentWorldPosition.z -
        this.previousWorldPosition.z;

      const distance = Math.sqrt(
        deltaX * deltaX +
        deltaZ * deltaZ
      );

      const speed =
        distance /
        Math.max(
          deltaTime / 1000,
          0.001
        );

      const isWalking =
        speed >= this.data.minSpeed &&
        speed <= this.data.maxSpeed;

      this.audio.volume =
        clamp01(
          this.data.volume *
          roomsMasterVolume
        );

      if (
        isWalking &&
        !this.isPlaying
      ) {
        try {
          const playPromise =
            this.audio.play();

          this.isPlaying = true;

          if (
            playPromise &&
            playPromise.catch
          ) {
            playPromise.catch(
              () => {
                this.isPlaying = false;
              }
            );
          }
        } catch (error) {
          this.isPlaying = false;
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
    }
  }
);


/* ============================================================
   AUDIO STATE
============================================================ */

function getRoomsAudioState() {
  return {
    muted: roomsMuted,
    volume: roomsMasterVolume,
    tvOn: roomsTVOn,
    unlocked: roomsAudioUnlocked,
    vrStarted: roomsVRStarted,
    lastUnlockSource:
      roomsLastUnlockSource,
    lastUnlockSuccess:
      roomsLastUnlockSuccess,
    directionalAvailable:
      roomsDirectionalAudio.available,
    directionalConnected:
      roomsDirectionalAudio.connected
  };
}


/* ============================================================
   DEBUG

   Browser console:
   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {
  const manager =
    getSpatialAudioManager();

  const tracks = [];

  if (manager) {
    manager.tracks.forEach(
      (track, id) => {
        tracks.push({
          id,
          src: track.definition.src,
          paused: track.audio.paused,
          targetVolume: Number(
            track.targetVolume.toFixed(3)
          ),
          distance:
            Number.isFinite(
              track.lastDistance
            )
              ? Number(
                  track.lastDistance.toFixed(2)
                )
              : null,
          distanceGain: Number(
            track.lastGain.toFixed(3)
          ),
          pan: Number(
            track.lastPan.toFixed(3)
          ),
          directionalConnected:
            track.directionalConnected,
          lastPlaySucceeded:
            track.lastPlaySucceeded,
          lastPlayError:
            track.lastPlayError,
          readyState:
            track.audio.readyState,
          networkState:
            track.audio.networkState,
          mediaError:
            track.audio.error
              ? track.audio.error.code
              : null
        });
      }
    );
  }

  return {
    unlocked: roomsAudioUnlocked,
    unlockInProgress: Boolean(
      roomsAudioUnlockInProgress
    ),
    vrStarted: roomsVRStarted,
    immersiveXR:
      hasRoomsImmersiveXRSession(
        getScene()
      ),
    muted: roomsMuted,
    masterVolume: roomsMasterVolume,
    tvOn: roomsTVOn,
    tvWorldPosition:
      roomsTVWorldPosition
        ? roomsTVWorldPosition.toArray()
        : null,
    paused:
      isRoomsPauseMenuOpen(),

    directional: {
      available:
        roomsDirectionalAudio.available,
      connected:
        roomsDirectionalAudio.connected,
      connecting:
        roomsDirectionalAudio.connecting,
      contextState:
        roomsDirectionalAudio.context
          ? roomsDirectionalAudio.context.state
          : 'none',
      lastError:
        roomsDirectionalAudio.lastError
    },

    spiral: {
      started:
        roomsSpiral.started,
      pan:
        roomsSpiral.panner
          ? Number(
              roomsSpiral.panner.pan.value
                .toFixed(3)
            )
          : null,
      gain:
        roomsSpiral.gain
          ? Number(
              roomsSpiral.gain.gain.value
                .toFixed(4)
            )
          : null
    },

    tracks
  };
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.enableSound =
  enableSound;

window.unlockRoomsAudio =
  startRoomsAudioFromGesture;

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
    /*
      Preload/setup only.
      Do NOT start sound here.
    */
    setupRoomsEnterVRButtonWatcher();
    updateRoomsVolumeUI();
  }
);