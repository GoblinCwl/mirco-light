package httpapi

// The work item was already committed with the friend record; this is only a wake-up.
func (s *Server) wakeFriendJobs() {
	if s.FriendJobsChanged != nil {
		s.FriendJobsChanged()
	}
}
