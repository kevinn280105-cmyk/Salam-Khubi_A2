/* ============================================================
   story.js
   STORY PROGRESS / CLUE TRACKING

   This file does NOT handle grabbing itself.

   engine-interactions.js already gives grabbed objects
   the A-Frame state:

   grabbed

   This file simply listens for clue objects getting that state.
============================================================ */


/* ============================================================
   TOTAL NUMBER OF CLUES

   Change this later only if your final project does not
   actually use 5 clues.
============================================================ */

const TOTAL_CLUES =
  5;


/* ============================================================
   STORY MANAGER
============================================================ */

AFRAME.registerComponent(
  'story-manager',
  {

    init: function () {

      /*
        Set remembers which clue IDs have
        already been collected.

        This prevents:

        pick up clue
        drop it
        pick it up again

        from counting as multiple clues.
      */
      this.collected =
        new Set();


      /*
        Stops all-clues-collected from
        firing more than once.
      */
      this.completed =
        false;


      /*
        Find every entity that has:

        class="clue"
      */
      const clues =
        Array.from(
          document.querySelectorAll(
            '.clue'
          )
        );


      /* ====================================================
         DEBUG WARNING

         Right now your existing index.html may not yet have
         all five clue objects.

         This warning helps you catch that.
      ==================================================== */

      if (
        clues.length !==
        TOTAL_CLUES
      ) {

        console.warn(
          `Story manager expects ${TOTAL_CLUES} clue(s), but currently found ${clues.length}.`
        );
      }


      /* ====================================================
         LISTEN TO EVERY CLUE
      ==================================================== */

      clues.forEach(
        (clueEl) => {

          clueEl.addEventListener(
            'stateadded',

            (event) => {

              /* ============================================
                 ONLY CARE ABOUT THE "grabbed" STATE
              ============================================ */

              if (
                !event.detail ||
                event.detail.state !==
                  'grabbed'
              ) {
                return;
              }


              /* ============================================
                 ALREADY COLLECTED?

                 Do not count it again.
              ============================================ */

              if (
                this.collected.has(
                  clueEl.id
                )
              ) {
                return;
              }


              /* ============================================
                 RECORD NEW CLUE
              ============================================ */

              this.collected.add(
                clueEl.id
              );


              const count =
                this.collected.size;


              console.log(
                `Clue collected: ${clueEl.id} (${count}/${TOTAL_CLUES})`
              );


              /* ============================================
                 CLEAN EVENT FOR OTHER FILES

                 This fixes the old ui-scare.js problem.

                 OLD:
                 ui-scare.js listened for "stateadded"
                 on #story-manager.

                 But story-manager itself never receives
                 the grabbed state.

                 NEW:

                 clue grabbed
                       ↓
                 story.js
                       ↓
                 emits "clue-collected"
                       ↓
                 UI / tutorial can react
              ============================================ */

              this.el.emit(
                'clue-collected',

                {
                  /*
                    Which clue was collected.
                  */
                  id:
                    clueEl.id,


                  /*
                    Current progress.
                  */
                  count:
                    count,


                  /*
                    Maximum progress.
                  */
                  total:
                    TOTAL_CLUES
                },

                false
              );


              /* ============================================
                 ALL CLUES COLLECTED
              ============================================ */

              if (
                count >=
                  TOTAL_CLUES &&

                !this.completed
              ) {

                this.completed =
                  true;


                console.log(
                  'All clues collected.'
                );


                /*
                  ui-scare.js listens for this.

                  This can trigger:

                  - scare footsteps
                  - jumpscare character
                  - final door event
                  - other climax events later
                */
                this.el.emit(
                  'all-clues-collected',

                  {
                    total:
                      TOTAL_CLUES
                  },

                  false
                );
              }
            }
          );
        }
      );
    }
  }
);