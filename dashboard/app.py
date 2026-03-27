import pandas as pd
import requests
import streamlit as st


st.title("Smart Attendance Dashboard")

default_api_url = "http://127.0.0.1:8000/api"
api_base = st.sidebar.text_input("API Base URL", value=default_api_url).rstrip("/")


def safe_get(path, params=None):
    try:
        response = requests.get(
            f"{api_base}{path}",
            params=params,
            timeout=8,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, str(exc)


def safe_post(path, payload):
    try:
        response = requests.post(
            f"{api_base}{path}",
            json=payload,
            timeout=8,
        )
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as exc:
        return None, str(exc)


health, health_error = safe_get("/health")
if health_error:
    st.sidebar.error("API unreachable")
else:
    st.sidebar.success("API connected")

stats, stats_error = safe_get("/stats/today")
if stats and not stats_error:
    st.sidebar.metric("Present Today", f"{stats['present_users']}/{stats['total_users']}")
    st.sidebar.metric("Attendance %", f"{stats['attendance_percent']}%")

menu = st.sidebar.selectbox(
    "Menu",
    [
        "Register User",
        "Users",
        "Attendance",
        "Export",
    ],
)

# REGISTER USER
if menu == "Register User":

    st.header("Register New Student")

    name = st.text_input("Student Name")

    if st.button("Register"):
        if name.strip():
            result, error = safe_post("/users", {"name": name.strip()})
            if error:
                st.error(f"Failed to register user: {error}")
            else:
                st.success(f"Registered {result['name']} (ID: {result['id']})")
        else:
            st.warning("Please enter a student name.")

    st.subheader("Quick Attendance Mark")
    users, users_error = safe_get("/users")
    if users_error:
        st.error(f"Unable to fetch users: {users_error}")
    elif users:
        user_options = {f"{u['name']} (ID: {u['id']})": u["id"] for u in users}
        selected_label = st.selectbox("Select User", list(user_options.keys()))
        if st.button("Mark Attendance"):
            mark_result, mark_error = safe_post(
                "/attendance/mark",
                {"user_id": user_options[selected_label]},
            )
            if mark_error:
                st.error(f"Failed to mark attendance: {mark_error}")
            else:
                status = mark_result.get("status", "unknown")
                if status == "already_marked":
                    st.info("Attendance already marked for today.")
                else:
                    st.success("Attendance marked successfully.")
    else:
        st.info("No users found. Register a user first.")

# USER LIST
elif menu == "Users":

    st.header("Registered Users")

    users, error = safe_get("/users")
    if error:
        st.error(f"Unable to fetch users: {error}")
    else:
        df = pd.DataFrame(users)
        st.dataframe(df, use_container_width=True)

# ATTENDANCE TABLE
elif menu == "Attendance":

    st.header("Attendance Records")

    filter_today = st.checkbox("Show only today", value=False)

    params = None
    if filter_today:
        params = {"date": pd.Timestamp.now().date().isoformat()}

    records, error = safe_get("/attendance", params=params)

    if error:
        st.error(f"Unable to fetch attendance: {error}")
    else:
        df = pd.DataFrame(records)
        st.dataframe(df, use_container_width=True)

# EXPORT REPORT
elif menu == "Export":

    st.header("Export Attendance Report")

    records, error = safe_get("/attendance")
    if error:
        st.error(f"Unable to fetch attendance: {error}")
    else:
        df = pd.DataFrame(records)
        csv = df.to_csv(index=False)

        st.download_button(
            label="Download CSV",
            data=csv,
            file_name="attendance_report.csv",
            mime="text/csv",
        )
