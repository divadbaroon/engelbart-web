"""A launch capability the project cannot ask for.

Watching an application's model calls from outside it needs a Node
preload inside it, and a preload is arbitrary code: whoever names the
file runs inside the application before its first line. So naming it is
not something a repository, a plan or a repair agent may do, and
`project_setup.env_override` refuses `--require` in a step's NODE_OPTIONS
for exactly that reason. That refusal stays as it is.

What is added here is a different door. The supervisor that started hc
names the file once, in hc's own environment, before any repository has
been read. A run then asks for the capability by name, and hc resolves
the name itself: it checks the file is absolute, real, readable and
outside the repository being run, and applies the result after
everything the plan set, so nothing inside the project can redirect it,
replace it or turn it off. The project is never asked and never told.
It is launched exactly as it would have been, with one more thing in its
environment.

Nothing here may cost a run. Every failure is a returned state with a
reason, never an exception into the launch path: an application that
cannot be watched must still run, and a preload that cannot be delivered
is a fact about the supervisor rather than about the application.

    HC_NODE_PRELOAD    absolute path to a CommonJS module to --require
    HC_LAUNCH_MARKERS  JSON object, at most 4 plain names, that the
                       preload reads to know which run it is in

The states a capability reports, which are the supervisor's vocabulary:

    available              delivered; whether it armed is the preload's to say
    unsupported_launcher   this command cannot receive a Node preload
    instrumentation_failed the supervisor's own configuration is unusable
    unavailable            not asked for, or nothing configured to deliver
"""
import json
import os
import re
from pathlib import Path

CAPABILITIES = ('modelCapture',)

MARKER_NAME = re.compile(r'[A-Z][A-Z0-9_]{0,63}')
MAX_MARKERS = 4
MAX_MARKER_VALUE = 512
# A path Node can be handed inside NODE_OPTIONS without quoting games.
PLAIN_PATH = re.compile(r'[^\s"\'\x00-\x1f]+')

# Commands that run a Node program, so a Node preload reaches them. The
# list is positive on purpose: claiming support we have not seen costs a
# silent empty trace, while withholding it costs only the watching.
# bun ignores --require (it preloads its own way), a container does not
# inherit this process's environment, and nothing else here is Node.
NODE_LAUNCHERS = frozenset(('node', 'nodejs', 'npm', 'npx', 'yarn', 'pnpm', 'pnpx', 'next', 'vite',
                            'nest', 'remix', 'nuxt', 'astro', 'ng', 'react-scripts', 'webpack',
                            'webpack-dev-server', 'parcel', 'tsx', 'ts-node', 'nodemon', 'serve'))


def wanted(request):
    """The capabilities a caller asked for, as a set of known names.

    Anything unrecognised is dropped rather than refused: a supervisor
    that knows about a capability this hc does not should still be able
    to start a run."""
    if not isinstance(request, dict):
        return set()
    return {name for name in CAPABILITIES if request.get(name) is True}


def _preload(environ):
    """The configured preload file, or why it cannot be used."""
    given = (environ.get('HC_NODE_PRELOAD') or '').strip()
    if not given:
        return None, 'unavailable', 'no preload is configured for this supervisor'
    if not PLAIN_PATH.fullmatch(given) or not os.path.isabs(given):
        return None, 'instrumentation_failed', 'the configured preload is not a plain absolute path'
    try:
        resolved = Path(given).resolve(strict=True)
        if not resolved.is_file():
            raise OSError('not a regular file')
        with open(resolved, 'rb') as f:
            f.read(1)
    except OSError as exc:
        return None, 'instrumentation_failed', 'the configured preload cannot be read: ' + str(exc)[:120]
    return resolved, None, None


def _markers(environ):
    """The values the preload reads to know which run it is in.

    A marker is the positive authorisation: a process that does not have
    one is not this run's application and the preload must stay asleep.
    Bounded and plainly named so this cannot become a second environment
    channel by accident.

    Returns (markers, complaint). No markers configured is allowed and
    quiet; markers configured and unusable is a fault, because a preload
    delivered without the marker it waits for can never wake up, and
    that would look exactly like an application that made no model
    calls."""
    raw = (environ.get('HC_LAUNCH_MARKERS') or '').strip()
    if not raw:
        return {}, None
    try:
        given = json.loads(raw)
    except ValueError:
        return {}, 'the configured launch markers are not JSON'
    if not isinstance(given, dict):
        return {}, 'the configured launch markers are not an object'
    if len(given) > MAX_MARKERS:
        return {}, 'at most %d launch markers may be set' % MAX_MARKERS
    out = {}
    for k, v in given.items():
        if not isinstance(k, str) or not MARKER_NAME.fullmatch(k):
            return {}, 'a launch marker is not a plain upper-case name'
        if not isinstance(v, str) or not v or len(v) > MAX_MARKER_VALUE or re.search(r'[\n\r\x00]', v):
            return {}, 'the value of ' + str(k)[:64] + ' is not a plain string of at most %d characters' % MAX_MARKER_VALUE
        out[k] = v
    return out, None


def _launcher(argv, command):
    """The name this step runs, as far as a preload is concerned."""
    first = (argv or [None])[0] or (command or '').split(' ')[0]
    return Path(str(first)).name.lower() if first else ''


def resolve(capabilities, repository_root, argv=None, command='', env=None, environ=None):
    """The environment to add to one application process, and what to say
    about it.

    Returns (extra_env, state, detail). `extra_env` is empty whenever the
    state is not 'available', and is meant to be applied last, after the
    plan's own per-step environment, so the plan cannot undo it."""
    environ = os.environ if environ is None else environ
    if 'modelCapture' not in (capabilities or set()):
        return {}, 'unavailable', 'not requested for this run'

    preload, failure, why = _preload(environ)
    if failure:
        return {}, failure, why

    # A preload inside the repository would be the application choosing
    # what runs inside itself, which is the one thing this door is for
    # preventing. It cannot happen through the configured path, and it
    # is checked anyway.
    try:
        root = Path(repository_root).resolve()
        if preload == root or preload.is_relative_to(root):
            return {}, 'instrumentation_failed', 'the configured preload is inside the repository being run'
    except (OSError, ValueError):
        pass

    launcher = _launcher(argv, command)
    if launcher not in NODE_LAUNCHERS:
        return {}, 'unsupported_launcher', (launcher or 'this command') + ' does not run a Node program that inherits NODE_OPTIONS'

    # Next re-serialises NODE_OPTIONS for the process it forks and two
    # --require flags do not survive it, so a project that already sets
    # one keeps it and goes unwatched.
    existing = (env or {}).get('NODE_OPTIONS', '') or ''
    if '--require' in existing or '--import' in existing:
        return {}, 'unsupported_launcher', 'the project already sets a Node preload of its own'

    markers, complaint = _markers(environ)
    if complaint:
        return {}, 'instrumentation_failed', complaint

    extra = dict(markers)
    extra['NODE_OPTIONS'] = ('--require=' + str(preload) + ' ' + existing).strip()
    return extra, 'available', str(preload)


def mask(text, environ=None):
    """Hide the marker values in anything on the way to a log.

    A marker carries this run's token, and an application that prints its
    own environment would otherwise put it in the trail."""
    text = str(text)
    for value in sorted(_markers(os.environ if environ is None else environ)[0].values(), key=len, reverse=True):
        text = text.replace(value, '[redacted]')
    return text
