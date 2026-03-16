import sqlite3

import pandas as pd
import streamlit as st


st.title("Smart Attendance Dashboard")

conn = sqlite3.connect("attendance.db")

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
            st.write("Run registration from main system")
        else:
            st.warning("Please enter a student name.")

# USER LIST
elif menu == "Users":

    st.header("Registered Users")

    df = pd.read_sql_query(
        "SELECT * FROM users",
        conn,
    )

    st.dataframe(df)

# ATTENDANCE TABLE
elif menu == "Attendance":

    st.header("Attendance Records")

    df = pd.read_sql_query(
        """
        SELECT users.name, attendance.date, attendance.time
        FROM attendance
        JOIN users ON users.id = attendance.user_id
        """,
        conn,
    )

    st.dataframe(df)

# EXPORT REPORT
elif menu == "Export":

    st.header("Export Attendance Report")

    df = pd.read_sql_query(
        """
        SELECT users.name, attendance.date, attendance.time
        FROM attendance
        JOIN users ON users.id = attendance.user_id
        """,
        conn,
    )

    csv = df.to_csv(index=False)

    st.download_button(
        label="Download CSV",
        data=csv,
        file_name="attendance_report.csv",
        mime="text/csv",
    )
