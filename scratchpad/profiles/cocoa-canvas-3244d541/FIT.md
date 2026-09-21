Cocoa Canvas · 13 episodes

surfaces
    13  canvas_app       /
     —  canvas_app_path  never matched

controls                      acts  episodes  anchor
  name_field                  2         2  rung 3
  join_button                 4         2  rung 4
  new_card_button             2         2  rung 4
  task_field                  2         2  rung 3
  create_button               2         2  rung 4
  run_all_button              —         —  rung 4
  stop_button                 —         —  rung 4
  run_step_button             —         —  rung 4
  user_step_button            —         —  rung 4
  submit_user_step            —         —  rung 4
  help_button                 —         —  rung 4
  regenerate_form_button        —         —  rung 4
  input_mode_toggle           —         —  rung 4
  user_response_field         —         —  rung 3
  attach_button               —         —  rung 4
  assignment_toggle           —         —  rung 4
  add_step_button             —         —  rung 4
  remove_step_button          —         —  rung 4
  delete_card_button          —         —  rung 4
  back_to_canvas              —         —  rung 4
  open_card_button            —         —  rung 4
  fork_control                —         —  rung 4
  fork_select_all             —         —  rung 4
  synthesize_button           —         —  rung 4
  final_results_entry         —         —  rung 4
  save_button                 —         —  rung 4
  cancel_button               —         —  rung 4
  edit_response_button        —         —  rung 4
  copy_code_button            —         —  rung 4
  expand_collapse_all         —         —  rung 4

channels                      text  anchor
  plan_status                 2  rung 4
  agent_working               —  rung 4
  synthesis_status            —  rung 4
  step_generating             —  rung 4
  card_plan                   2  rung 1
  canvas_root                 4  rung 1
  (no channel)                —

rules                            read
     1 r_idle                          1  UNCLEAR
     5 r_reload                        —  ACTING
    10 r_join                          2  ACTING
    12 r_name                          2  ACTING
    20 r_create_card                   2  ACTING
    22 r_describe_task                 2  FORMULATING
    30 r_run_all                       —  ACTING
    31 r_stop_all                      —  ACTING
    32 r_run_step                      —  ACTING
    34 r_submit_user_step              —  ACTING
    36 r_help                          —  ACTING
    38 r_regen_form                    —  ACTING
    40 r_synthesize                    —  ACTING
    42 r_toggle_assignment             —  REVISING
    43 r_add_step                      —  REVISING
    44 r_remove_step                   —  REVISING
    45 r_save_edit                     —  REVISING
    46 r_delete_card                   —  ACTING
    47 r_fork                          —  ACTING
    48 r_copy_code                     —  ACTING
    50 r_write_response                —  FORMULATING
    52 r_awaiting                      2  WAITING
    54 r_generating_indicator          —  WAITING
    60 r_open_final                    —  UNDERSTANDING
    61 r_sections                      —  UNDERSTANDING
    62 r_open_card                     —  ACTING
    63 r_back                          —  ACTING
    64 r_open_user_input               —  ACTING
    65 r_open_new_task                 —  ACTING
    66 r_edit_response                 —  ACTING
    67 r_attach                        —  ACTING
    68 r_switch_input_mode             —  ACTING
    69 r_cancel                        —  ACTING
    70 r_escape                        —  ACTING
    80 r_text_entry                    —  FORMULATING
     — r_fallback (fallback)           2

dead — nothing in this session matched them
  surface canvas_app_path — Cocoa Canvas ({key})
  control run_all_button — the Run All button
  control stop_button — the Stop button
  control run_step_button — a step's Run control
  control user_step_button — a user step's input control
  control submit_user_step — the Submit button of the user step input
  control help_button — the Help me button
  control regenerate_form_button — the Regenerate form button
  control input_mode_toggle — the guided-form / freeform toggle
  control user_response_field — the freeform response box of a user step
  control attach_button — the Attach control
  control assignment_toggle — a step's Agent/User assignment toggle
  control add_step_button — the Add step button
  control remove_step_button — a step's remove control
  control delete_card_button — the Delete card control
  control back_to_canvas — the Back to canvas control
  control open_card_button — a card's Open button
  control fork_control — a Fork control
  control fork_select_all — the fork dialog's select-all control
  control synthesize_button — the Synthesize control
  control final_results_entry — the Final Results entry
  control save_button — a Save button
  control cancel_button — a Cancel button
  control edit_response_button — the edit-response control
  control copy_code_button — the Copy code control
  control expand_collapse_all — the expand-all / collapse-all control
  channel agent_working — the step result panel
  channel synthesis_status — the final results panel
  channel step_generating — the step's status

silent — never read a stretch
  r_reload (RELOAD_CANVAS)
  r_run_all (RUN_ALL)
  r_stop_all (STOP_ALL)
  r_run_step (RUN_STEP)
  r_submit_user_step (SUBMIT_USER_STEP)
  r_help (HELP_ME)
  r_regen_form (REGENERATE_FORM)
  r_synthesize (SYNTHESIZE_FINAL_RESULTS)
  r_toggle_assignment (TOGGLE_ASSIGNMENT)
  r_add_step (ADD_STEP)
  r_remove_step (REMOVE_STEP)
  r_save_edit (SAVE_EDIT)
  r_delete_card (DELETE_CARD)
  r_fork (FORK_CARD)
  r_copy_code (COPY_CODE)
  r_write_response (WRITE_USER_RESPONSE)
  r_generating_indicator (GENERATION_IN_PROGRESS)
  r_open_final (OPEN_FINAL_RESULTS)
  r_sections (EXPAND_SECTIONS)
  r_open_card (OPEN_CARD)
  r_back (BACK_TO_CANVAS)
  r_open_user_input (OPEN_USER_STEP_INPUT)
  r_open_new_task (OPEN_NEW_TASK)
  r_edit_response (EDIT_RESPONSE)
  r_attach (ATTACH_FILES)
  r_switch_input_mode (SWITCH_INPUT_MODE)
  r_cancel (CANCEL)
  r_escape (ESCAPE_DISMISS)
  r_text_entry (TEXT_ENTRY)

not read off the artifact
  surface canvas_app_path — inference: Defensive catch-all in case a future recording keys the document by some other path. Only /  was served in the recording seen.
  rule r_awaiting — abstraction: AGENT_RUNNING names what plan generation, step running, help and synthesis have in common: a server-side model call in flight. The recording cannot say which of them it was.
  rule r_generating_indicator — abstraction: Cards are synced over Yjs, so such an indicator can in principle be produced by a peer rather than by this person; the description only states that it appeared.
  rule r_text_entry — abstraction: Catches writing in fields the profile cannot anchor: the inline step-description editor (a bare input), the result editors, and inputs inside model-generated guided forms. It deliberately does not say which field.