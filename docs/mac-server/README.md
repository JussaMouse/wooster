# Wooster macOS Service Scripts

This directory contains scripts to install and uninstall Wooster as a background service (`launchd` LaunchAgent) on macOS.

This ensures that Wooster starts automatically when you log in and restarts automatically if it ever crashes.

## Files

- `install_service.sh`: Sets up and starts the `launchd` service.
- `uninstall_service.sh`: Stops and removes the `launchd` service.

## Usage

You must run these scripts from the root directory of your Wooster project.

### To Install the Service

1.  Make the script executable:
    ```bash
    chmod +x install_service.sh
    ```
2.  Run the installer:
    ```bash
    ./install_service.sh
    ```

### To Uninstall the Service

1.  Make the script executable:
    ```bash
    chmod +x uninstall_service.sh
    ```
2.  Run the uninstaller:
    ```bash
    ./uninstall_service.sh
    ```

### Checking Logs

The service's output (`stdout`) and errors (`stderr`) are redirected to log files in the `logs/` directory of your Wooster project.

-   **Standard Output Log**: `logs/wooster.stdout.log`
-   **Standard Error Log**: `logs/wooster.stderr.log`

You can monitor these logs in real-time using `tail`:
```bash
# Monitor the output log
tail -f logs/wooster.stdout.log

# Monitor the error log
tail -f logs/wooster.stderr.log
```

## Managing the Service

Once the service is installed, you can manage it from the terminal using `launchctl`.

### List Your Service

To check the status of the Wooster service, use `launchctl list` and `grep` for its label.

```bash
# Search for the loaded service
launchctl list | grep com.wooster.app
```

**Understanding the Output:**
You will see a line with three columns:
-   **PID:** The first number is the Process ID. If it's a number (e.g., `12345`), the service is running. If it's a dash (`-`), the service is loaded but not running.
-   **Status:** The second number is the exit status. A `0` means it last exited successfully. Any other number indicates an error.
-   **Label:** The third string is the unique label for your service, `com.wooster.app`.

### Stop and Start the Service

You can manually stop and start the service without having to unload it completely.

```bash
# To stop the service
launchctl stop com.wooster.app

# To start the service again
launchctl start com.wooster.app
```

### Restarting the Service (Kickstart)

If the service is stuck or you need to force a restart after making configuration changes, `kickstart` is a powerful command.

```bash
# Force a stop and restart of the service
launchctl kickstart -k gui/$(id -u)/com.wooster.app
```
- `gui/$(id -u)/` is the correct domain for a user-level LaunchAgent. `$(id -u)` gets your current user ID.

This is the most effective way to ensure `launchd` re-reads all configurations and restarts the process cleanly. 